from datetime import datetime
from typing import Optional
import enum

from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, ForeignKey, Boolean,
    Enum as SAEnum, JSON, func,
)
from sqlalchemy.orm import relationship

from backend.database import Base


# ── Enums ────────────────────────────────────────────────────────────────────

class ContactStatusEnum(str, enum.Enum):
    not_contacted = "not_contacted"
    contacted = "contacted"
    converted = "converted"
    lost = "lost"


class UserRoleEnum(str, enum.Enum):
    manager = "manager"
    sales_agent = "sales_agent"


class InviteStatusEnum(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


# ── Tables ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="sales_agent", nullable=False)  # manager | sales_agent
    created_at = Column(DateTime, server_default=func.now())

    team_memberships = relationship("TeamMember", back_populates="user", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    invites = relationship("TeamInvite", back_populates="team", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="team")


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="member", nullable=False)  # leader | member
    target_quota = Column(Integer, nullable=True, default=50)
    joined_at = Column(DateTime, server_default=func.now())

    team = relationship("Team", back_populates="members")
    user = relationship("User", back_populates="team_memberships")


class TeamInvite(Base):
    __tablename__ = "team_invites"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(200), index=True, nullable=False)
    role = Column(String(50), default="sales_agent", nullable=False)
    status = Column(String(50), default="pending", nullable=False)  # pending | accepted | declined
    invited_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    team = relationship("Team", back_populates="invites")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    target_quota = Column(Integer, nullable=True, default=50)
    assignment_note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    team = relationship("Team", back_populates="sessions")
    creator = relationship("User", foreign_keys=[created_by_id])
    assignee = relationship("User", foreign_keys=[assigned_to_id])
    customers = relationship("Customer", back_populates="session", cascade="all, delete-orphan")
    chat_history = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")



class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)

    # Original customer identifier from CSV (may be auto-generated)
    customer_id = Column(String(100), nullable=False, index=True)

    # Key numeric fields surfaced for fast queries / stat cards
    monthly_charges = Column(Float, nullable=True)
    total_charges = Column(Float, nullable=True)
    tenure = Column(Integer, nullable=True)

    # Full original CSV row stored as JSON for flexibility
    raw_data = Column(JSON, nullable=False)

    # ML outputs stored denormalised for fast access
    risk_score = Column(Float, nullable=True)          # 0–100
    shap_values = Column(JSON, nullable=True)          # [{feature, value, impact}, ...]

    # Contact tracking
    contact_status = Column(
        SAEnum(ContactStatusEnum),
        default=ContactStatusEnum.not_contacted,
        nullable=False,
    )
    contact_notes = Column(Text, nullable=True)
    contact_updated_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="customers")


class ChatMessage(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)          # "user" | "assistant" | "tool"
    content = Column(Text, nullable=False)
    tool_calls_json = Column(JSON, nullable=True)      # raw tool_calls blob for replaying
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="chat_history")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
