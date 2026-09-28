"""
teams.py — Team Management, Member Invites & Acceptance Workflow Router.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend import models, schemas
from backend.routers.auth import get_current_user, require_manager
from backend.alerts import send_team_invite_alert, send_high_risk_batch_alert

router = APIRouter(prefix="/teams", tags=["teams"])


@router.post("/test-email")
def test_email(email: str = "oaa5429946@gmail.com"):
    from backend.alerts import send_email_alert
    success = send_email_alert(
        email,
        "Churn Intelligence Live Alert Test",
        "<h3>System Status: Online</h3><p>Your automated churn alert email integration is now active and delivering to your inbox.</p>"
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to deliver email. Check backend terminal logs for SMTP details.")
    return {"message": f"Test email successfully sent to {email}"}



@router.get("/roster", response_model=List[schemas.RosterUserOut])
def get_workspace_roster(
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    users = db.query(models.User).order_by(models.User.name.asc()).all()
    roster = []
    for u in users:
        membership = (
            db.query(models.TeamMember, models.Team)
            .join(models.Team, models.TeamMember.team_id == models.Team.id)
            .filter(models.TeamMember.user_id == u.id)
            .first()
        )
        roster.append(schemas.RosterUserOut(
            id=u.id,
            email=u.email,
            name=u.name,
            role=u.role,
            team_id=membership[0].team_id if membership else None,
            team_name=membership[1].name if membership else None,
            joined_at=membership[0].joined_at if membership else None,
        ))
    return roster


@router.get("/", response_model=List[schemas.TeamOut])
def list_teams(
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    if not user:
        return []

    if user.role == "manager":
        teams = db.query(models.Team).order_by(models.Team.created_at.desc()).all()
    else:
        teams = (
            db.query(models.Team)
            .join(models.TeamMember, models.TeamMember.team_id == models.Team.id)
            .filter(models.TeamMember.user_id == user.id)
            .order_by(models.Team.created_at.desc())
            .all()
        )
    results = []
    for t in teams:
        member_records = (
            db.query(models.TeamMember, models.User)
            .join(models.User, models.TeamMember.user_id == models.User.id)
            .filter(models.TeamMember.team_id == t.id)
            .all()
        )
        members_out = [
            schemas.TeamMemberOut(
                id=tm.id,
                user_id=u.id,
                name=u.name,
                email=u.email,
                role=tm.role,
                joined_at=tm.joined_at,
            )
            for tm, u in member_records
        ]
        out = schemas.TeamOut(
            id=t.id,
            name=t.name,
            created_by_id=t.created_by_id,
            created_at=t.created_at,
            member_count=len(members_out),
            members=members_out,
        )
        results.append(out)
    return results


@router.post("/", response_model=schemas.TeamOut, status_code=201)
def create_team(
    payload: schemas.TeamCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_manager),
):
    team_name = payload.name.strip()
    if not team_name:
        raise HTTPException(status_code=400, detail="Team name cannot be empty.")

    team = models.Team(name=team_name, created_by_id=user.id)
    db.add(team)
    db.commit()
    db.refresh(team)

    # Automatically add creator as team leader/member
    member = models.TeamMember(team_id=team.id, user_id=user.id, role="leader")
    db.add(member)
    db.commit()

    return schemas.TeamOut(
        id=team.id,
        name=team.name,
        created_by_id=team.created_by_id,
        created_at=team.created_at,
        member_count=1,
        members=[
            schemas.TeamMemberOut(
                id=1,
                user_id=user.id,
                name=user.name,
                email=user.email,
                role="leader",
                joined_at=team.created_at,
            )
        ],
    )


@router.post("/{team_id}/members", response_model=schemas.TeamMemberOut)
def add_team_member_direct(
    team_id: int,
    payload: schemas.TeamMemberAdd,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_manager),
):
    team = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    target_user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    existing = db.query(models.TeamMember).filter(
        models.TeamMember.team_id == team_id,
        models.TeamMember.user_id == target_user.id
    ).first()

    if existing:
        existing.role = payload.role
        existing.target_quota = payload.target_quota or existing.target_quota or 50
        db.commit()
        db.refresh(existing)
        return schemas.TeamMemberOut(
            id=existing.id,
            user_id=target_user.id,
            name=target_user.name,
            email=target_user.email,
            role=existing.role,
            target_quota=existing.target_quota,
            joined_at=existing.joined_at,
        )

    new_member = models.TeamMember(
        team_id=team_id,
        user_id=target_user.id,
        role=payload.role,
        target_quota=payload.target_quota or 50
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    return schemas.TeamMemberOut(
        id=new_member.id,
        user_id=target_user.id,
        name=target_user.name,
        email=target_user.email,
        role=new_member.role,
        target_quota=new_member.target_quota,
        joined_at=new_member.joined_at,
    )


@router.get("/{team_id}/metrics", response_model=schemas.TeamMetricsOut)
def get_team_metrics(
    team_id: int,
    db: Session = Depends(get_db),
):
    team = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    member_records = (
        db.query(models.TeamMember, models.User)
        .join(models.User, models.TeamMember.user_id == models.User.id)
        .filter(models.TeamMember.team_id == team_id)
        .all()
    )

    agent_metrics = []
    total_assigned = 0
    total_contacted = 0
    total_saved = 0
    total_revenue_saved = 0.0

    for tm, u in member_records:
        # Skip managers/leaders — they oversee and assign work, they do not work quotas
        if tm.role == "leader" or u.role == "manager":
            continue

        assigned_sessions = db.query(models.Session).filter(
            models.Session.assigned_to_id == u.id
        ).all()
        session_ids = [s.id for s in assigned_sessions]

        quota = tm.target_quota or 50
        contacted = 0
        saved = 0
        rev_saved = 0.0

        if session_ids:
            contacted = db.query(func.count(models.Customer.id)).filter(
                models.Customer.session_id.in_(session_ids),
                models.Customer.contact_status != "not_contacted"
            ).scalar() or 0

            saved = db.query(func.count(models.Customer.id)).filter(
                models.Customer.session_id.in_(session_ids),
                models.Customer.contact_status == "converted"
            ).scalar() or 0

            rev_saved = db.query(func.sum(models.Customer.monthly_charges)).filter(
                models.Customer.session_id.in_(session_ids),
                models.Customer.contact_status == "converted"
            ).scalar() or 0.0

            total_cust = db.query(func.count(models.Customer.id)).filter(
                models.Customer.session_id.in_(session_ids)
            ).scalar() or 0
            total_assigned += total_cust

        total_contacted += contacted
        total_saved += saved
        total_revenue_saved += float(rev_saved)

        pct = round(min(100.0, (contacted / quota * 100.0) if quota > 0 else 0.0), 1)
        agent_metrics.append(schemas.AgentMetric(
            user_id=u.id,
            name=u.name,
            email=u.email,
            role=tm.role,
            target_quota=quota,
            contacted_count=contacted,
            saved_count=saved,
            revenue_saved=round(float(rev_saved), 2),
            progress_pct=pct
        ))

    agent_metrics.sort(key=lambda a: (a.saved_count, a.contacted_count), reverse=True)
    retention_rate = round((total_saved / total_contacted * 100.0) if total_contacted > 0 else 0.0, 1)

    return schemas.TeamMetricsOut(
        team_id=team.id,
        team_name=team.name,
        total_agents=len(agent_metrics),
        total_assigned=total_assigned,
        total_contacted=total_contacted,
        total_saved=total_saved,
        team_retention_rate=retention_rate,
        revenue_saved=round(total_revenue_saved, 2),
        agent_metrics=agent_metrics,
    )


@router.post("/{team_id}/invites", response_model=schemas.InviteOut)
def invite_member(
    team_id: int,
    payload: schemas.InviteCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    team = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    target_email = payload.email.lower().strip()
    if not target_email or "@" not in target_email:
        raise HTTPException(status_code=400, detail="Valid email address is required.")

    # Check if already in team
    existing_user = db.query(models.User).filter(models.User.email == target_email).first()
    if existing_user:
        already_member = db.query(models.TeamMember).filter(
            models.TeamMember.team_id == team_id,
            models.TeamMember.user_id == existing_user.id,
        ).first()
        if already_member:
            raise HTTPException(status_code=400, detail="User is already a member of this team.")

    # Check if pending invite exists
    existing_invite = db.query(models.TeamInvite).filter(
        models.TeamInvite.team_id == team_id,
        models.TeamInvite.email == target_email,
        models.TeamInvite.status == "pending",
    ).first()

    if existing_invite:
        invite = existing_invite
    else:
        invite = models.TeamInvite(
            team_id=team_id,
            email=target_email,
            role=payload.role,
            status="pending",
            invited_by_id=user.id if user else None,
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)

    # Trigger background automated email alert
    inviter_name = user.name if user else "The Retention Manager"
    background_tasks.add_task(send_team_invite_alert, target_email, team.name, inviter_name)

    return schemas.InviteOut(
        id=invite.id,
        team_id=invite.team_id,
        team_name=team.name,
        email=invite.email,
        role=invite.role,
        status=invite.status,
        created_at=invite.created_at,
    )


@router.get("/invites/pending", response_model=List[schemas.InviteOut])
def get_pending_invites(
    email: Optional[str] = None,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    target_email = (user.email if user else email or "").lower().strip()
    if not target_email:
        return []

    invites = (
        db.query(models.TeamInvite, models.Team)
        .join(models.Team, models.TeamInvite.team_id == models.Team.id)
        .filter(
            models.TeamInvite.email == target_email,
            models.TeamInvite.status == "pending",
        )
        .all()
    )

    return [
        schemas.InviteOut(
            id=inv.id,
            team_id=inv.team_id,
            team_name=t.name,
            email=inv.email,
            role=inv.role,
            status=inv.status,
            created_at=inv.created_at,
        )
        for inv, t in invites
    ]


@router.post("/invites/{invite_id}/accept")
def accept_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    invite = db.query(models.TeamInvite).filter(models.TeamInvite.id == invite_id).first()
    if not invite or invite.status != "pending":
        raise HTTPException(status_code=404, detail="Pending invite not found.")

    # Find or auto-create user for this email
    target_user = user
    if not target_user:
        target_user = db.query(models.User).filter(models.User.email == invite.email).first()
        if not target_user:
            target_user = models.User(
                email=invite.email,
                name=invite.email.split("@")[0].title(),
                hashed_password="demo",
                role=invite.role,
            )
            db.add(target_user)
            db.commit()
            db.refresh(target_user)

    # Add as member
    already_member = db.query(models.TeamMember).filter(
        models.TeamMember.team_id == invite.team_id,
        models.TeamMember.user_id == target_user.id,
    ).first()

    if not already_member:
        member = models.TeamMember(
            team_id=invite.team_id,
            user_id=target_user.id,
            role="member",
        )
        db.add(member)

    invite.status = "accepted"
    db.commit()

    return {"message": "Invite accepted successfully", "team_id": invite.team_id}


@router.post("/invites/{invite_id}/decline")
def decline_invite(
    invite_id: int,
    db: Session = Depends(get_db),
):
    invite = db.query(models.TeamInvite).filter(models.TeamInvite.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found.")

    invite.status = "declined"
    db.commit()
    return {"message": "Invite declined"}


@router.post("/{team_id}/assign-session/{session_id}")
def assign_session_to_team(
    team_id: int,
    session_id: int,
    payload: schemas.SessionAssign,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user),
):
    if not user or user.role != "manager":
        raise HTTPException(status_code=403, detail="Only managers can assign sessions to teams.")

    team = db.query(models.Team).filter(models.Team.id == team_id).first()
    session = db.query(models.Session).filter(models.Session.id == session_id).first()

    if not team or not session:
        raise HTTPException(status_code=404, detail="Team or Session not found.")

    # Verify target user is in the team
    target_member = db.query(models.TeamMember).filter(
        models.TeamMember.team_id == team_id,
        models.TeamMember.user_id == payload.user_id
    ).first()

    if not target_member:
        raise HTTPException(status_code=400, detail="Target user is not a member of this team.")

    target_user = db.query(models.User).filter(models.User.id == payload.user_id).first()

    session.team_id = team_id
    session.assigned_to_id = payload.user_id
    session.target_quota = payload.target_quota or 50
    session.assignment_note = payload.note
    if target_member:
        target_member.target_quota = payload.target_quota or 50

    # Create in-app notification
    if target_user:
        notification = models.Notification(
            user_id=target_user.id,
            title="New Session Assigned",
            message=f"Session '{session.name}' assigned to your queue. Manager Note: {payload.note or 'No notes provided.'}"
        )
        db.add(notification)

    db.commit()

    # Calculate high risk stats for alert
    high_count = db.query(func.count(models.Customer.id)).filter(
        models.Customer.session_id == session_id,
        models.Customer.risk_score >= 70,
    ).scalar() or 0

    rev_at_risk = db.query(func.sum(models.Customer.monthly_charges)).filter(
        models.Customer.session_id == session_id,
        models.Customer.risk_score >= 70,
    ).scalar() or 0.0

    if target_user:
        background_tasks.add_task(
            send_high_risk_batch_alert,
            [target_user.email],
            session.name,
            high_count,
            float(rev_at_risk),
            target_user.name,
            payload.note
        )

    return {"message": f"Session assigned to {target_user.name}", "alerted_members": 1}

@router.delete("/{team_id}/members/{user_id}")
def remove_team_member(
    team_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    team = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    
    member = db.query(models.TeamMember).filter(
        models.TeamMember.team_id == team_id,
        models.TeamMember.user_id == user_id
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this team.")
        
    db.delete(member)

    # Clean up: unassign any sessions assigned to this agent in this team or across the workspace
    sessions = db.query(models.Session).filter(
        (models.Session.team_id == team_id) | (models.Session.team_id.is_(None)),
        models.Session.assigned_to_id == user_id
    ).all()
    for s in sessions:
        s.assigned_to_id = None
        s.target_quota = None
        s.assignment_note = None

    db.commit()
    return {"message": "Member removed and all associated session assignments unassigned successfully"}

