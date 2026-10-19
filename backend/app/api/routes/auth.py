from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.security import create_access_token, get_current_user, hash_password, verify_password
from ...db.session import get_db
from ...models import Organization, User
from ...schemas.common import AuthResponse, LoginRequest, SignupRequest, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if existing:
        raise HTTPException(409, "An account with this email already exists")

    slug_base = payload.organization_name.lower().strip()
    slug_base = "".join(c if c.isalnum() else "-" for c in slug_base).strip("-")
    slug = slug_base or "organization"
    candidate = slug
    counter = 1
    while db.scalar(select(Organization).where(Organization.slug == candidate)):
        candidate = f"{slug}-{counter}"
        counter += 1

    org = Organization(name=payload.organization_name, slug=candidate)
    db.add(org)
    db.flush()

    user = User(
        email=payload.email.lower().strip(),
        name=payload.name,
        password_hash=hash_password(payload.password),
        organization_id=org.id,
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(org)

    return AuthResponse(access_token=create_access_token(user), user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return AuthResponse(access_token=create_access_token(user), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user
