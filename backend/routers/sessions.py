from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend import models, schemas
from backend.config import get_settings
from backend.routers.auth import get_current_user, require_manager
from typing import Optional

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/", response_model=list[schemas.SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user)
):
    if not user:
        return []

    if user.role == "manager":
        # Managers see all sessions they created or that belong to their teams
        team_ids = [tm.team_id for tm in db.query(models.TeamMember).filter(models.TeamMember.user_id == user.id).all()]
        sessions = (
            db.query(models.Session)
            .filter(
                (models.Session.created_by_id == user.id) |
                (models.Session.team_id.in_(team_ids))
            )
            .order_by(models.Session.created_at.desc())
            .all()
        )
    else:
        # Agents only see sessions explicitly assigned to them
        sessions = (
            db.query(models.Session)
            .filter(models.Session.assigned_to_id == user.id)
            .order_by(models.Session.created_at.desc())
            .all()
        )
    result = []
    for s in sessions:
        # Verify assignee is still valid member if team_id is set
        assigned_name = None
        if s.assigned_to_id:
            if s.team_id:
                is_member = db.query(models.TeamMember).filter(
                    models.TeamMember.team_id == s.team_id,
                    models.TeamMember.user_id == s.assigned_to_id
                ).first()
                if not is_member:
                    s.assigned_to_id = None
                    s.target_quota = None
                    s.assignment_note = None
                    db.commit()
                else:
                    assigned_name = s.assignee.name if s.assignee else None
            else:
                assigned_name = s.assignee.name if s.assignee else None

        # If agent view and assignment was cleared, don't include
        if user.role != "manager" and not s.assigned_to_id:
            continue

        count = db.query(func.count(models.Customer.id)).filter(
            models.Customer.session_id == s.id
        ).scalar()
        out = schemas.SessionOut.model_validate(s)
        out.customer_count = count or 0
        out.assigned_to_name = assigned_name
        result.append(out)
    return result



@router.post("/", response_model=schemas.SessionOut, status_code=201)
def create_session(
    payload: schemas.SessionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_manager),
):
    session = models.Session(
        name=payload.name,
        description=payload.description,
        created_by_id=user.id
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    out = schemas.SessionOut.model_validate(session)
    out.customer_count = 0
    return out


@router.get("/{session_id}", response_model=schemas.SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    count = db.query(func.count(models.Customer.id)).filter(
        models.Customer.session_id == session_id
    ).scalar()
    out = schemas.SessionOut.model_validate(s)
    out.customer_count = count or 0
    return out


@router.patch("/{session_id}", response_model=schemas.SessionOut)
def update_session(
    session_id: int,
    payload: schemas.SessionUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_manager),
):
    s = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if payload.name is not None:
        s.name = payload.name.strip()
    if payload.description is not None:
        s.description = payload.description.strip()
    db.commit()
    db.refresh(s)

    count = db.query(func.count(models.Customer.id)).filter(
        models.Customer.session_id == session_id
    ).scalar()
    out = schemas.SessionOut.model_validate(s)
    out.customer_count = count or 0
    return out


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_manager),
):
    s = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    # Delete associated customers and chat messages first
    db.query(models.Customer).filter(models.Customer.session_id == session_id).delete()
    db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).delete()
    db.delete(s)
    db.commit()



@router.get("/{session_id}/stats", response_model=schemas.SessionStats)
def get_session_stats(
    session_id: int,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    settings = get_settings()
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    
    assigned_agent_name = None
    assigned_agent_id = None
    target_quota = None
    if session:
        target_quota = session.target_quota
        if session.assignee:
            if session.team_id:
                is_member = db.query(models.TeamMember).filter(
                    models.TeamMember.team_id == session.team_id,
                    models.TeamMember.user_id == session.assignee.id,
                ).first()
                if not is_member:
                    session.assigned_to_id = None
                    session.target_quota = None
                    session.assignment_note = None
                    db.commit()
                else:
                    assigned_agent_name = session.assignee.name
                    assigned_agent_id = session.assignee.id
            else:
                assigned_agent_name = session.assignee.name
                assigned_agent_id = session.assignee.id

    # Build team_agents for managers — all agents with assigned sessions in the same team
    team_agents = []
    if user and user.role == "manager" and session and session.team_id:
        assigned_sessions = (
            db.query(models.Session)
            .filter(
                models.Session.team_id == session.team_id,
                models.Session.assigned_to_id.isnot(None),
            )
            .all()
        )
        for s in assigned_sessions:
            agent = s.assignee
            if not agent:
                continue
            is_member = db.query(models.TeamMember).filter(
                models.TeamMember.team_id == session.team_id,
                models.TeamMember.user_id == agent.id,
            ).first()
            if not is_member:
                s.assigned_to_id = None
                s.target_quota = None
                s.assignment_note = None
                db.commit()
                continue
            s_contacted = db.query(func.count(models.Customer.id)).filter(
                models.Customer.session_id == s.id,
                models.Customer.contact_status.in_(['contacted', 'converted', 'lost'])
            ).scalar() or 0
            s_converted = db.query(func.count(models.Customer.id)).filter(
                models.Customer.session_id == s.id,
                models.Customer.contact_status == 'converted'
            ).scalar() or 0
            team_agents.append(schemas.AgentProgress(
                user_id=agent.id,
                name=agent.name,
                session_name=s.name,
                target_quota=s.target_quota or 50,
                contacted_count=s_contacted,
                converted_count=s_converted,
                assignment_note=s.assignment_note,
            ))



    total_customers = db.query(func.count(models.Customer.id)).filter(models.Customer.session_id == session_id).scalar() or 0
    high_count = db.query(func.count(models.Customer.id)).filter(models.Customer.session_id == session_id, models.Customer.risk_score >= 70).scalar() or 0
    med_count = db.query(func.count(models.Customer.id)).filter(models.Customer.session_id == session_id, models.Customer.risk_score >= 40, models.Customer.risk_score < 70).scalar() or 0
    low_count = db.query(func.count(models.Customer.id)).filter(models.Customer.session_id == session_id, models.Customer.risk_score < 40).scalar() or 0
    
    revenue_at_risk = db.query(func.sum(models.Customer.monthly_charges)).filter(models.Customer.session_id == session_id, models.Customer.risk_score >= 70).scalar() or 0.0
    revenue_saved = db.query(func.sum(models.Customer.monthly_charges)).filter(models.Customer.session_id == session_id, models.Customer.contact_status == 'converted').scalar() or 0.0
    avg_risk = db.query(func.avg(models.Customer.risk_score)).filter(models.Customer.session_id == session_id).scalar() or 0.0
    
    contacted_count = db.query(func.count(models.Customer.id)).filter(
        models.Customer.session_id == session_id,
        models.Customer.contact_status.in_(['contacted', 'converted', 'lost'])
    ).scalar() or 0
    converted_count = db.query(func.count(models.Customer.id)).filter(
        models.Customer.session_id == session_id,
        models.Customer.contact_status == 'converted'
    ).scalar() or 0

    return schemas.SessionStats(
        session_id=session_id,
        total_customers=total_customers,
        high_risk_count=high_count,
        medium_risk_count=med_count,
        low_risk_count=low_count,
        revenue_at_risk=round(float(revenue_at_risk), 2),
        revenue_saved=round(float(revenue_saved), 2),
        avg_risk_score=round(float(avg_risk), 1),
        model_auc=settings.model_auc,
        assigned_agent_id=assigned_agent_id,
        assigned_agent_name=assigned_agent_name,
        target_quota=target_quota,
        assignment_note=session.assignment_note if session else None,
        contacted_count=contacted_count,
        converted_count=converted_count,
        team_agents=team_agents,
    )



@router.get("/{session_id}/chat-history", response_model=list[schemas.ChatMessageOut])
def get_chat_history(session_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session_id)
        .order_by(models.ChatMessage.created_at)
        .all()
    )
