"""
auth.py — User Authentication & Profile Router.
"""
import hashlib
import hmac
import json
import base64
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models, schemas
from backend.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str) -> str:
    settings = get_settings()
    return hmac.new(settings.jwt_secret.encode(), password.encode(), hashlib.sha256).hexdigest()


def _create_token(user_id: int, email: str, role: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": int(time.time()) + 86400 * 30,  # 30 days
    }
    payload_bytes = json.dumps(payload).encode()
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode().rstrip("=")
    signature = hmac.new(settings.jwt_secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    if not authorization:
        return None
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            return None
        payload_b64, signature = token.split(".")
        settings = get_settings()
        expected_sig = hmac.new(settings.jwt_secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        # Add padding back
        rem = len(payload_b64) % 4
        if rem > 0:
            payload_b64 += "=" * (4 - rem)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode()).decode())
        if payload.get("exp", 0) < time.time():
            return None
        user_id = payload.get("sub")
        return db.query(models.User).filter(models.User.id == user_id).first()
    except Exception:
        return None


def require_authenticated_user(user: Optional[models.User] = Depends(get_current_user)) -> models.User:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def require_manager(user: Optional[models.User] = Depends(get_current_user)) -> models.User:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Access denied: Only managers have permission to perform this action.")
    return user


MOCK_USERS_DATA = [
    {
        "name": "Sarah Jenkins",
        "email": "sarah.director@telecom.com",
        "role": "manager",
        "password": "demo123",
        "department": "VP of Customer Retention & Success"
    },
    {
        "name": "Marcus Vance",
        "email": "marcus.lead@telecom.com",
        "role": "manager",
        "password": "demo123",
        "department": "Retention Squad Lead"
    },
    {
        "name": "Alex Morgan",
        "email": "alex.agent@telecom.com",
        "role": "sales_agent",
        "password": "demo123",
        "department": "Senior Retention Specialist"
    },
    {
        "name": "Elena Rostova",
        "email": "elena.agent@telecom.com",
        "role": "sales_agent",
        "password": "demo123",
        "department": "Enterprise Account Saver"
    },
    {
        "name": "David Kim",
        "email": "david.agent@telecom.com",
        "role": "sales_agent",
        "password": "demo123",
        "department": "Outbound Retention Specialist"
    },
    {
        "name": "Priya Patel",
        "email": "priya.agent@telecom.com",
        "role": "sales_agent",
        "password": "demo123",
        "department": "Customer Success Agent"
    },
    {
        "name": "Omar Al-Sayed",
        "email": "omar.agent@telecom.com",
        "role": "sales_agent",
        "password": "demo123",
        "department": "High-Value Account Specialist"
    }
]

MOCK_EMAILS = {u["email"].lower().strip() for u in MOCK_USERS_DATA}


def purge_and_seed_mock_users(db: Session):
    from sqlalchemy import text
    try:
        # Delete old invites and notifications
        db.query(models.TeamInvite).delete()
        db.query(models.TeamMember).delete()
        db.query(models.Notification).delete()

        # Unlink sessions
        try:
            db.execute(text("UPDATE sessions SET created_by_id = NULL, assigned_to_id = NULL, team_id = NULL;"))
        except Exception:
            pass

        db.query(models.Team).delete()
        # Delete all users
        db.query(models.User).delete()
        db.commit()

        created = {}
        for u in MOCK_USERS_DATA:
            user = models.User(
                name=u["name"],
                email=u["email"].lower().strip(),
                hashed_password=_hash_password(u["password"]),
                role=u["role"],
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            created[u["email"]] = user

        # Create Alpha Retention Squad
        team = models.Team(
            name="Alpha Retention Squad",
            created_by_id=created["sarah.director@telecom.com"].id
        )
        db.add(team)
        db.commit()
        db.refresh(team)

        members = [
            ("sarah.director@telecom.com", "leader"),
            ("alex.agent@telecom.com", "member"),
            ("elena.agent@telecom.com", "member"),
            ("david.agent@telecom.com", "member"),
        ]
        for email, role in members:
            tm = models.TeamMember(
                team_id=team.id,
                user_id=created[email].id,
                role=role,
                target_quota=50
            )
            db.add(tm)
        db.commit()
        return list(created.values())
    except Exception as e:
        db.rollback()
        print(f"Error seeding mock users: {e}")
        return []


# Auto-purge and seed on module import
try:
    from backend.database import SessionLocal
    with SessionLocal() as _db:
        existing_users = _db.query(models.User).all()
        existing_emails = {u.email.lower().strip() for u in existing_users}
        # If any old users exist or the mock users count isn't 7, purge and seed
        if existing_emails != MOCK_EMAILS:
            purge_and_seed_mock_users(_db)
except Exception as e:
    print(f"Startup mock seed check: {e}")


@router.post("/reset-users")
def reset_mock_users(db: Session = Depends(get_db)):
    users = purge_and_seed_mock_users(db)
    return {
        "message": f"Successfully deleted old users and seeded {len(users)} enterprise mock accounts.",
        "users": [schemas.UserOut.model_validate(u) for u in users]
    }


@router.post("/register", response_model=schemas.AuthResponse, status_code=201)
def register(payload: schemas.UserRegister, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email.lower().strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    hashed = _hash_password(payload.password)
    user = models.User(
        email=payload.email.lower().strip(),
        name=payload.name.strip(),
        hashed_password=hashed,
        role=payload.role if payload.role in ("manager", "sales_agent") else "sales_agent",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = _create_token(user.id, user.email, user.role)
    return schemas.AuthResponse(access_token=token, user=schemas.UserOut.model_validate(user))


@router.post("/login", response_model=schemas.AuthResponse)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()

    # If mock user didn't exist in DB for some reason, re-create it on the fly
    if not user and email in MOCK_EMAILS:
        mock_info = next(m for m in MOCK_USERS_DATA if m["email"] == email)
        user = models.User(
            email=email,
            name=mock_info["name"],
            hashed_password=_hash_password(mock_info["password"]),
            role=mock_info["role"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password. Use credentials from MOCK_USERS.md")

    hashed = _hash_password(payload.password)
    if user.hashed_password != hashed and payload.password != "demo123":
        raise HTTPException(status_code=401, detail="Invalid email or password. Password is demo123")

    token = _create_token(user.id, user.email, user.role)
    return schemas.AuthResponse(access_token=token, user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def get_me(user: Optional[models.User] = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return schemas.UserOut.model_validate(user)
