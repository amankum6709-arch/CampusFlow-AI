"""Action-taking assistant endpoints (timetable page panel).

Read-only analysis plus a strict propose -> preview -> validate ->
approve workflow. Proposals never mutate data; only ``approve``
writes, in a single transaction, after re-checking staleness,
locks, ids and the full hard-constraint set.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.security import get_current_user, require_org_scoped
from ...db.session import get_db
from ...models import (
    AssistantProposal,
    Faculty,
    Room,
    TimetableEntry,
    TimetableRun,
    User,
)
from ...schemas.common import (
    AssistantChatRequest,
    AssistantProposalRead,
    AssistantProposeRequest,
)
from ...services import assistant as svc

router = APIRouter(prefix="/assistant", tags=["assistant"])

_VALID_INTENTS = {"fix_all", "optimize", "move_class"}


def _get_run(db: Session, user: User, run_id: str) -> TimetableRun:
    run = db.get(TimetableRun, run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    return run


def _proposal_out(proposal: AssistantProposal, stale: bool = False) -> dict:
    return {
        "id": proposal.id,
        "organization_id": proposal.organization_id,
        "run_id": proposal.run_id,
        "intent": proposal.intent,
        "status": proposal.status,
        "base_fingerprint": proposal.base_fingerprint,
        "changes": proposal.changes or [],
        "impact": proposal.impact or {},
        "error": proposal.error,
        "stale": stale,
    }


@router.post("/runs/{run_id}/analyze")
def analyze_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = _get_run(db, user, run_id)
    ctx = svc.load_context(db, run)
    validation = svc.validate_current(ctx)
    conflicts = svc.classify_conflicts(validation, ctx)
    hard = [c for c in conflicts if c["severity"] == "high"]
    soft = [c for c in conflicts if c["severity"] != "high"]
    return {
        "run_id": run.id,
        "fingerprint": svc.compute_fingerprint(ctx["entries"], run.status),
        "valid": validation["valid"],
        "summary": (
            "Timetable is conflict-free."
            if validation["valid"]
            else f"{len(conflicts)} conflict(s) found: {len(hard)} hard, {len(soft)} advisory."
        ),
        "metrics": validation.get("metrics", {}),
        "conflicts": conflicts,
    }


@router.post("/runs/{run_id}/propose")
def propose_changes(
    run_id: str,
    payload: AssistantProposeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    run = _get_run(db, user, run_id)
    if payload.intent not in _VALID_INTENTS:
        raise HTTPException(400, f"Unknown intent '{payload.intent}'. Use fix_all, optimize or move_class.")
    ctx = svc.load_context(db, run)
    if not ctx["entries"]:
        proposal = AssistantProposal(
            organization_id=run.organization_id, run_id=run.id, intent=payload.intent,
            status="pending", base_fingerprint=svc.compute_fingerprint([], run.status),
            changes=[], impact=svc.compute_impact(ctx, [], [], []),
        )
        db.add(proposal)
        db.commit()
        db.refresh(proposal)
        return _proposal_out(proposal)

    params = dict(payload.params or {})
    soft_info = None
    if payload.intent == "fix_all":
        changes, baseline, proposed = svc.generate_fix_proposal(ctx)
        if not changes and baseline:
            proposal = AssistantProposal(
                organization_id=run.organization_id, run_id=run.id, intent=payload.intent,
                status="pending", base_fingerprint=svc.compute_fingerprint(ctx["entries"], run.status),
                changes=[], impact=svc.compute_impact(ctx, baseline, proposed, []),
                error=("No feasible automatic fix found within the current constraints. "
                       "Review room capacity/availability, faculty leave, or regenerate the timetable."),
            )
            db.add(proposal)
            db.commit()
            db.refresh(proposal)
            return _proposal_out(proposal)
    elif payload.intent == "optimize":
        changes, baseline, proposed, soft_info = svc.generate_optimize_proposal(ctx)
    else:
        change, note = svc.resolve_move(ctx, params)
        if not change:
            raise HTTPException(422, note)
        baseline = svc.validate_current(ctx)["errors"]
        patched = svc._patched_entries(
            [dict(e) for e in ctx["entries"]], set(change["entry_ids"]),
            change["after"]["day"], change["after"]["period"],
            change["after"]["room_id"], change["after"]["faculty_id"],
        )
        proposed = svc.validate_current(ctx, patched)["errors"]
        changes = [dict(change, change_id="chg-1")]

    impact = svc.compute_impact(ctx, baseline, proposed, changes, soft_info)
    proposal = AssistantProposal(
        organization_id=run.organization_id, run_id=run.id, intent=payload.intent,
        status="pending", base_fingerprint=svc.compute_fingerprint(ctx["entries"], run.status),
        changes=changes, impact=impact,
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return _proposal_out(proposal)


@router.get("/proposals/{proposal_id}", response_model=AssistantProposalRead)
def get_proposal(proposal_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    proposal = db.get(AssistantProposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    run = db.get(TimetableRun, proposal.run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    ctx = svc.load_context(db, run)
    stale = svc.compute_fingerprint(ctx["entries"], run.status) != proposal.base_fingerprint
    return _proposal_out(proposal, stale=stale)


@router.post("/proposals/{proposal_id}/approve")
def approve_proposal(proposal_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    proposal = db.get(AssistantProposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    run = db.get(TimetableRun, proposal.run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    if proposal.status == "approved":
        raise HTTPException(409, "Proposal was already applied and cannot be approved twice")
    if proposal.status != "pending":
        raise HTTPException(409, f"Proposal is {proposal.status} and cannot be approved")

    ctx = svc.load_context(db, run)
    if svc.compute_fingerprint(ctx["entries"], run.status) != proposal.base_fingerprint:
        raise HTTPException(409, "Timetable changed since this proposal was generated. Regenerate the proposal to review fresh changes.")
    if not (proposal.impact or {}).get("valid", False):
        raise HTTPException(422, "Proposal is not valid: it would introduce new conflicts.")

    rows = {e.id: e for e in db.query(TimetableEntry).filter(TimetableEntry.run_id == run.id).all()}
    faculty_ids = {r.id for r in db.query(Faculty).filter(Faculty.organization_id == run.organization_id).all()}
    room_ids = {r.id for r in db.query(Room).filter(Room.organization_id == run.organization_id).all()}
    for change in proposal.changes or []:
        after = change.get("after") or {}
        if after.get("day") not in ctx["days"] or int(after.get("period", -1)) not in [int(p) for p in ctx["periods"]]:
            raise HTTPException(422, "Proposal targets a slot outside the timetable configuration")
        if not after.get("room_id") or after["room_id"] not in room_ids:
            raise HTTPException(422, "Proposal references an unknown room")
        if not after.get("faculty_id") or after["faculty_id"] not in faculty_ids:
            raise HTTPException(422, "Proposal references an unknown faculty member")
        for eid in change.get("entry_ids", []):
            row = rows.get(str(eid))
            if not row:
                raise HTTPException(422, "Proposal references a missing timetable entry")
            if row.locked:
                raise HTTPException(409, "A targeted class was locked after the proposal. Unlock it and regenerate.")

    for change in proposal.changes or []:
        after = change["after"]
        for eid in change.get("entry_ids", []):
            row = rows[str(eid)]
            # Expand to lab siblings so an occurrence always moves together.
            targets = [row]
            if row.session_id:
                sibs = [r for r in rows.values() if r.session_id == row.session_id]
                if len(sibs) > 1:
                    if any(s.locked for s in sibs):
                        raise HTTPException(409, "A lab session was locked after the proposal. Unlock it and regenerate.")
                    targets = sibs
            for item in targets:
                item.day = after["day"]
                item.period = int(after["period"])
                item.room_id = after["room_id"]
                item.faculty_id = after["faculty_id"]

    proposal.status = "approved"
    proposal.decided_at = datetime.utcnow()
    db.commit()

    fresh = svc.load_context(db, run)
    validation = svc.validate_current(fresh)
    return {
        "proposal_id": proposal.id,
        "status": "approved",
        "applied_changes": len(proposal.changes or []),
        "remaining_errors": validation["errors"],
        "valid": validation["valid"],
        "fingerprint": svc.compute_fingerprint(fresh["entries"], run.status),
    }


@router.post("/proposals/{proposal_id}/cancel")
def cancel_proposal(proposal_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    proposal = db.get(AssistantProposal, proposal_id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    run = db.get(TimetableRun, proposal.run_id)
    if not run:
        raise HTTPException(404, "Timetable run not found")
    require_org_scoped(run.organization_id, user)
    if proposal.status != "pending":
        raise HTTPException(409, f"Proposal is {proposal.status} and cannot be cancelled")
    proposal.status = "cancelled"
    proposal.decided_at = datetime.utcnow()
    db.commit()
    return {"proposal_id": proposal.id, "status": "cancelled"}


@router.post("/runs/{run_id}/chat")
def chat(run_id: str, payload: AssistantChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = _get_run(db, user, run_id)
    try:
        return svc.answer_chat(db, run, payload.message)
    except Exception as exc:
        return {"answer": f"I encountered an error: {exc}", "action": None}


@router.get("/runs/{run_id}/proposals", response_model=list[AssistantProposalRead])
def list_proposals(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = _get_run(db, user, run_id)
    proposals = (
        db.query(AssistantProposal)
        .filter(AssistantProposal.run_id == run.id)
        .order_by(AssistantProposal.created_at.desc())
        .limit(20)
        .all()
    )
    ctx = svc.load_context(db, run)
    current = svc.compute_fingerprint(ctx["entries"], run.status)
    return [_proposal_out(p, stale=(current != p.base_fingerprint)) for p in proposals]
