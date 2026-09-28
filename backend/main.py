"""
main.py — FastAPI application entrypoint.

Run locally with:
  cd c:\\Eand
  uvicorn backend.main:app --reload --port 8000

API docs: http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import Base, engine
from backend.routers import sessions, customers, upload, chat, auth, teams, notifications

from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

# ── Create all DB tables on startup (idempotent) ──────────────────────────────
Base.metadata.create_all(bind=engine)

# Auto-migrate columns if tables existed previously
with engine.begin() as db:
    try:
        db.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;"))
        db.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
        db.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
        db.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS target_quota INTEGER DEFAULT 50;"))
        db.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS assignment_note TEXT;"))
        db.execute(text("ALTER TABLE team_members ADD COLUMN IF NOT EXISTS target_quota INTEGER DEFAULT 50;"))
    except Exception as e:
        logger.error(f"Migration error: {e}")

# Check and auto-seed mock users if needed
try:
    from seed_mock_users import seed_users
    from backend.database import SessionLocal
    _check_db = SessionLocal()
    _has_sarah = _check_db.query(models.User).filter(models.User.email == "sarah.director@telecom.com").first()
    _user_count = _check_db.query(models.User).count()
    _check_db.close()
    if not _has_sarah or _user_count < 7:
        logger.info("Initializing 7 enterprise mock users...")
        seed_users()
except Exception as e:
    logger.error(f"Auto-seed error: {e}")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Churn Intelligence API",
    description="ML-powered churn risk scoring and retention assistant.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS — allow React dev server ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(sessions.router)
app.include_router(customers.router)
app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(notifications.router)


@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "service": "Churn Intelligence API"}
