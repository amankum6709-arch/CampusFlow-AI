import { useEffect, useRef, useState } from "react";
import {
  FiX, FiMinus, FiSend, FiZap, FiCheck, FiAlertTriangle,
  FiClock, FiMessageSquare, FiRefreshCw, FiShield,
} from "react-icons/fi";
import { api } from "../../services/api";
import { hasFeature, FEATURES } from "../../utils/subscription";
import UpgradePrompt from "../UpgradePrompt/UpgradePrompt";
import "./AIAssistantPanel.css";

let messageSeq = 0;
const nextId = () => `m${Date.now()}-${messageSeq++}`;

function severityClass(severity) {
  return severity === "high" ? "aiap-sev-high" : "aiap-sev-med";
}

function ConflictCard({ conflict }) {
  return (
    <div className="aiap-conflict">
      <div className="aiap-conflict-top">
        <span className={`aiap-sev ${severityClass(conflict.severity)}`}>
          {conflict.severity === "high" ? "Hard violation" : "Advisory"}
        </span>
        <span className="aiap-conflict-id">{conflict.id}</span>
      </div>
      <div className="aiap-conflict-type">{(conflict.type || "unknown").replace(/_/g, " ")}</div>
      <p className="aiap-conflict-text">{conflict.explanation}</p>
      <div className="aiap-conflict-meta">
        {[conflict.subject, conflict.faculty, conflict.room,
          conflict.section || conflict.batch,
          conflict.day && conflict.period ? `${conflict.day} · Period ${conflict.period}` : null]
          .filter(Boolean).map((v, i) => <span key={i}>{v}</span>)}
      </div>
      <div className="aiap-conflict-rule">
        <FiShield size={12} /> {conflict.constraint} — {conflict.recommendation}
      </div>
    </div>
  );
}

function ChangeCard({ change, index }) {
  const before = change.before || {};
  const after = change.after || {};
  return (
    <div className="aiap-change">
      <div className="aiap-change-title">
        <span className="aiap-change-id">{change.change_id || `chg-${index + 1}`}</span>
        <strong>{change.subject || "Class"}{change.section ? ` · ${change.section}` : ""}</strong>
      </div>
      <div className="aiap-before-after">
        <div className="aiap-ba-col">
          <span className="aiap-ba-label">Before</span>
          <span>{before.day} · Period {before.period}</span>
          <span>{before.room || "—"}</span>
          <span className="aiap-dim">{before.faculty || ""}</span>
        </div>
        <div className="aiap-ba-arrow" aria-hidden="true">→</div>
        <div className="aiap-ba-col aiap-ba-after">
          <span className="aiap-ba-label">After</span>
          <span>{after.day} · Period {after.period}</span>
          <span>{after.room || "—"}</span>
          <span className="aiap-dim">{after.faculty || ""}</span>
        </div>
      </div>
      <p className="aiap-change-reason">{change.reason}</p>
      {(change.conflicts_resolved?.length > 0) && (
        <div className="aiap-resolved"><FiCheck size={13} /> Resolves {change.conflicts_resolved.length} conflict(s)</div>
      )}
      <div className="aiap-validated"><FiShield size={12} /> Validated — no new conflicts</div>
    </div>
  );
}

function ImpactSummary({ impact }) {
  if (!impact) return null;
  const stats = [
    ["Changes", impact.total_changes ?? 0],
    ["Resolved", impact.resolved_count ?? 0],
    ["Unresolved", impact.unresolved_count ?? 0],
    ["New conflicts", impact.new_conflict_count ?? 0],
  ];
  return (
    <div className="aiap-impact">
      <div className="aiap-impact-title">Impact summary</div>
      <div className="aiap-impact-grid">
        {stats.map(([label, value]) => (
          <div className="aiap-impact-stat" key={label}>
            <strong>{value}</strong><span>{label}</span>
          </div>
        ))}
      </div>
      {(impact.unresolved_count > 0) && (
        <div className="aiap-note aiap-note-warn">
          <FiAlertTriangle size={13} /> {impact.unresolved_count} conflict(s) remain outside this proposal.
        </div>
      )}
      {impact.soft && (
        <div className="aiap-note">
          Schedule quality {Number(impact.soft.cost_before).toFixed(1)} → {Number(impact.soft.cost_after).toFixed(1)} (lower is better).
        </div>
      )}
    </div>
  );
}

function AIAssistantPanel({ runId, open, onClose, onApplied }) {
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [proposal, setProposal] = useState(null);
  const [proposalState, setProposalState] = useState("none"); // none|pending|approved|stale|invalid
  const [error, setError] = useState("");
  const [upgradeFeature, setUpgradeFeature] = useState(null);
  const [convRunId, setConvRunId] = useState(runId);
  const bodyRef = useRef(null);

  // A new run gets a fresh conversation; same run keeps history.
  if (convRunId !== runId) {
    setConvRunId(runId);
    setMessages([]);
    setProposal(null);
    setProposalState("none");
    setError("");
  }

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, proposal, busy]);

  const push = (role, text, attachment) => {
    setMessages((current) => [...current, { id: nextId(), role, text, attachment }]);
  };

  const needUpgrade = () => {
    if (!hasFeature(FEATURES.AI_ASSISTANT)) {
      setUpgradeFeature(FEATURES.AI_ASSISTANT);
      return true;
    }
    return false;
  };

  const runAnalyze = async (silent) => {
    if (!runId || busy) return null;
    if (needUpgrade()) return null;
    setBusy(true);
    setBusyLabel("Analyzing timetable…");
    setError("");
    try {
      const result = await api.assistantAnalyze(runId);
      if (!silent) {
        push("assistant", result.summary, { type: "conflicts", conflicts: result.conflicts });
      }
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const runPropose = async (intent, params, userText) => {
    if (!runId || busy) return;
    if (needUpgrade()) return;
    if (userText) push("user", userText);
    setBusy(true);
    setBusyLabel(intent === "optimize" ? "Optimizing schedule…" : "Generating proposal…");
    setError("");
    try {
      const result = await api.assistantPropose(runId, intent, params || {});
      setProposal(result);
      if (!result.impact?.valid) {
        setProposalState("invalid");
        push("assistant", result.error || "No feasible proposal could be generated within the current constraints.", { type: "proposal", proposal: result });
      } else if (!(result.changes || []).length) {
        setProposalState("none");
        setProposal(null);
        push("assistant", "Nothing to change — the timetable already satisfies every hard constraint.");
      } else {
        setProposalState("pending");
        push("assistant", `Prepared ${result.changes.length} validated change(s). Review them below — nothing has been modified yet.`, { type: "proposal", proposal: result });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const handleApprove = async () => {
    if (!proposal || busy || proposalState !== "pending") return;
    setBusy(true);
    setBusyLabel("Validating & applying…");
    setError("");
    try {
      const fresh = await api.assistantProposal(proposal.id);
      if (fresh.stale || fresh.status !== "pending") {
        setProposalState("stale");
        setError("The timetable changed since this proposal was generated. Regenerate it to review fresh changes.");
        return;
      }
      const result = await api.assistantApprove(proposal.id);
      setProposalState("approved");
      push("assistant", `Applied ${result.applied_changes} change(s). Backend revalidation: ${result.valid ? "clean" : `${(result.remaining_errors || []).length} remaining issue(s)`}.`, null);
      onApplied?.(result);
    } catch (err) {
      const msg = err.message || "";
      if (msg.toLowerCase().includes("changed since")) {
        setProposalState("stale");
      } else if (msg.toLowerCase().includes("new conflict") || msg.toLowerCase().includes("not valid")) {
        setProposalState("invalid");
      }
      setError(msg);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const handleCancel = async () => {
    if (!proposal || busy) return;
    if (proposalState !== "pending") {
      setProposal(null);
      setProposalState("none");
      return;
    }
    setBusy(true);
    try {
      await api.assistantCancel(proposal.id);
      setProposalState("none");
      setProposal(null);
      push("assistant", "Proposal discarded. The saved timetable is unchanged.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy || !runId) return;
    if (needUpgrade()) return;
    setInput("");
    push("user", text);
    setBusy(true);
    setBusyLabel("Thinking…");
    setError("");
    try {
      const result = await api.assistantChat(runId, text);
      const action = result.action;
      if (action?.type === "propose") {
        setBusy(false);
        setBusyLabel("");
        await runPropose(action.intent, action.params || {}, null);
        push("assistant", result.answer);
        return;
      }
      if (action?.type === "analyze") {
        const analysis = await runAnalyze(true);
        push("assistant", result.answer,
          analysis ? { type: "conflicts", conflicts: analysis.conflicts } : null);
        return;
      }
      push("assistant", result.answer);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  if (!open) return null;

  const approveDisabled = busy || proposalState !== "pending" || !proposal?.impact?.valid;

  return (
    <aside className={`aiap-panel ${minimized ? "aiap-minimized" : ""}`} aria-label="CampusFlow AI Assistant">
      <header className="aiap-header">
        <span className="aiap-avatar" aria-hidden="true">✦</span>
        <div className="aiap-titles">
          <strong>CampusFlow AI Assistant</strong>
          <span>Conflict analysis &amp; safe schedule fixes</span>
        </div>
        <button className="aiap-icon-btn" onClick={() => setMinimized(!minimized)} aria-label={minimized ? "Expand assistant" : "Minimize assistant"}>
          {minimized ? <FiMessageSquare size={16} /> : <FiMinus size={16} />}
        </button>
        <button className="aiap-icon-btn" onClick={onClose} aria-label="Close assistant">
          <FiX size={16} />
        </button>
      </header>

      {!minimized && (
        <>
          <div className="aiap-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="aiap-welcome">
                <p><strong>Namaste!</strong> I can analyze this timetable for conflicts, propose validated fixes for your approval, and answer questions about workload and slots.</p>
                <p className="aiap-dim">I never change anything until you click <strong>Approve Changes</strong>.</p>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`aiap-msg aiap-msg-${m.role}`}>
                <div className="aiap-bubble">{m.text}</div>
                {m.attachment?.type === "conflicts" && (
                  <div className="aiap-cards">
                    {m.attachment.conflicts.length === 0 && (
                      <div className="aiap-note aiap-note-ok"><FiCheck size={13} /> No conflicts — timetable is clean.</div>
                    )}
                    {m.attachment.conflicts.map((c) => <ConflictCard key={c.id} conflict={c} />)}
                  </div>
                )}
                {m.attachment?.type === "proposal" && m.attachment.proposal.changes?.length > 0 && (
                  <div className="aiap-cards">
                    {m.attachment.proposal.changes.map((ch, i) => <ChangeCard key={ch.change_id || i} change={ch} index={i} />)}
                    <ImpactSummary impact={m.attachment.proposal.impact} />
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="aiap-msg aiap-msg-assistant">
                <div className="aiap-bubble aiap-thinking">
                  <span className="aiap-spinner" aria-hidden="true" />
                  {busyLabel || "Working…"}
                </div>
              </div>
            )}
            {error && <div className="aiap-error" role="alert">{error}</div>}
          </div>

          <div className="aiap-actions">
            <button className="aiap-quick" disabled={busy || !runId} onClick={() => { push("user", "Analyze timetable"); runAnalyze(false); }}>
              <FiShield size={14} /> Analyze
            </button>
            <button className="aiap-quick" disabled={busy || !runId} onClick={() => runPropose("fix_all", {}, "Fix all conflicts")}>
              <FiZap size={14} /> Fix All Conflicts
            </button>
            <button className="aiap-quick" disabled={busy || !runId} onClick={() => runPropose("optimize", {}, "Optimize schedule")}>
              <FiRefreshCw size={14} /> Optimize
            </button>
          </div>

          {proposal && proposalState !== "none" && (proposal.changes || []).length > 0 && (
            <div className="aiap-footer">
              {proposalState === "stale" && (
                <div className="aiap-note aiap-note-warn"><FiAlertTriangle size={13} /> Proposal is outdated — regenerate before approving.</div>
              )}
              {proposalState === "invalid" && (
                <div className="aiap-note aiap-note-warn"><FiAlertTriangle size={13} /> Proposal is not valid and cannot be approved.</div>
              )}
              {proposalState === "approved" && (
                <div className="aiap-note aiap-note-ok"><FiCheck size={13} /> Changes applied and revalidated.</div>
              )}
              <div className="aiap-footer-btns">
                <button className="aiap-approve" disabled={approveDisabled} onClick={handleApprove}>
                  {busy ? <><FiClock size={14} /> Applying…</> : <><FiCheck size={14} /> Approve Changes</>}
                </button>
                <button className="aiap-cancel" disabled={busy || proposalState === "approved"} onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="aiap-input-row">
            <input
              className="aiap-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={runId ? "Ask or request a change…" : "Select a timetable run first"}
              disabled={busy || !runId}
              aria-label="Message the assistant"
            />
            <button className="aiap-send" onClick={handleSend} disabled={busy || !input.trim() || !runId} aria-label="Send message">
              <FiSend size={16} />
            </button>
          </div>
        </>
      )}

      {upgradeFeature && (
        <UpgradePrompt feature={upgradeFeature} onDismiss={() => setUpgradeFeature(null)} />
      )}
    </aside>
  );
}

export default AIAssistantPanel;
