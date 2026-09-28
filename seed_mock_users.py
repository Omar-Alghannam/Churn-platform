"""
seed_mock_users.py — Reset all users and seed 7 professional enterprise B2B mock users.
"""
import sys
import os

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.database import SessionLocal, engine
from backend import models
from backend.routers.auth import _hash_password
from sqlalchemy import text

def seed_users():
    db = SessionLocal()
    try:
        print("Resetting existing user and team records...")
        # Clean up existing invites, team members, teams, users
        db.query(models.TeamInvite).delete()
        db.query(models.TeamMember).delete()
        db.query(models.Notification).delete()
        
        # Unlink sessions from users/teams
        db.execute(text("UPDATE sessions SET created_by_id = NULL, assigned_to_id = NULL, team_id = NULL;"))
        db.commit()

        db.query(models.Team).delete()
        db.query(models.User).delete()
        db.commit()

        print("Creating 7 enterprise mock users...")
        MOCK_USERS = [
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

        created_users = {}
        for u in MOCK_USERS:
            db_user = models.User(
                name=u["name"],
                email=u["email"].lower().strip(),
                hashed_password=_hash_password(u["password"]),
                role=u["role"]
            )
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            created_users[u["email"]] = db_user
            print(f"  ✓ Created user: {u['name']} ({u['email']}) - Role: {u['role']}")

        # Create default Enterprise Squad
        print("Creating default 'Alpha Retention Squad'...")
        team = models.Team(
            name="Alpha Retention Squad",
            created_by_id=created_users["sarah.director@telecom.com"].id
        )
        db.add(team)
        db.commit()
        db.refresh(team)

        # Add initial team members
        initial_members = [
            ("sarah.director@telecom.com", "leader"),
            ("alex.agent@telecom.com", "member"),
            ("elena.agent@telecom.com", "member"),
            ("david.agent@telecom.com", "member"),
        ]

        for email, role in initial_members:
            m = models.TeamMember(
                team_id=team.id,
                user_id=created_users[email].id,
                role=role
            )
            db.add(m)
        db.commit()
        print("  ✓ Squad created with 4 active members. (Priya Patel and Omar Al-Sayed available in workspace roster to add)")

        # Generate MOCK_USERS.md file
        doc_content = "# Enterprise B2B Workspace Credentials & Mock Users\n\n"
        doc_content += "All accounts use the standard password: `demo123`\n\n"
        doc_content += "| Name | Email | Password | Role | Department / Title |\n"
        doc_content += "| :--- | :--- | :--- | :--- | :--- |\n"
        for u in MOCK_USERS:
            role_label = "👔 Manager" if u["role"] == "manager" else "🎧 Retention Agent"
            doc_content += f"| **{u['name']}** | `{u['email']}` | `demo123` | {role_label} | {u['department']} |\n"
        
        doc_content += "\n---\n\n"
        doc_content += "### 🏢 Default Team Configured:\n"
        doc_content += "- **Team Name:** `Alpha Retention Squad`\n"
        doc_content += "- **Leader:** Sarah Jenkins (`sarah.director@telecom.com`)\n"
        doc_content += "- **Active Squad Members:** Alex Morgan, Elena Rostova, David Kim\n"
        doc_content += "- **Available in Workspace Roster:** Priya Patel, Omar Al-Sayed (ready to be added in 1 click)\n"

        with open(os.path.join(os.path.dirname(__file__), "MOCK_USERS.md"), "w", encoding="utf-8") as f:
            f.write(doc_content)

        print("  ✓ Wrote credentials to c:\\Eand\\MOCK_USERS.md")
        print("Seed completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding users: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()
