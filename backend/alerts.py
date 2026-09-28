"""
alerts.py — Dynamic Email Alert & Notification Service.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from backend.config import get_settings

logger = logging.getLogger("alerts")


def send_email_alert(to_email: str, subject: str, html_body: str) -> bool:
    """
    Sends an email alert using SMTP.
    If SMTP credentials are not configured, it logs the alert cleanly for visibility.
    """
    settings = get_settings()

    print(f"📧 [EMAIL DISPATCH] To: {to_email} | Subject: {subject}")

    smtp_user = settings.smtp_user.strip()
    smtp_pwd = settings.smtp_password.replace(" ", "").strip()

    if not smtp_user or not smtp_pwd:
        print(f"💡 SMTP credentials not set in .env. Email simulated successfully to {to_email}.")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = to_email

        # Add plain text fallback to avoid spam filters
        import re
        plain_text = re.sub('<[^<]+?>', '', html_body)
        part1 = MIMEText(plain_text, "plain")
        part2 = MIMEText(html_body, "html")
        
        msg.attach(part1)
        msg.attach(part2)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            server.login(smtp_user, smtp_pwd)
            server.sendmail(smtp_user, [to_email], msg.as_string())

        print(f"✅ REAL EMAIL DELIVERED to {to_email} via Gmail SMTP!")
        return True
    except Exception as e:
        print(f"❌ SMTP Error delivering email to {to_email}: {e}")
        return False



def send_team_invite_alert(to_email: str, team_name: str, inviter_name: str) -> bool:
    subject = f"👥 You've been invited to join Team '{team_name}' — Churn Intelligence"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #00d4ff;">⚡ Churn Intelligence Team Invite</h2>
        <p>Hello,</p>
        <p><strong>{inviter_name}</strong> has invited you to join <strong>{team_name}</strong> as a Retention Agent.</p>
        <div style="background: #1e293b; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #00d4ff;">
            <p style="margin: 0;"><strong>Team:</strong> {team_name}</p>
            <p style="margin: 5px 0 0 0;"><strong>Role:</strong> Sales / Retention Agent</p>
        </div>
        <p>Log in to your Churn Intelligence dashboard to accept the invite and access your assigned customer queue.</p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">Enterprise Churn Intelligence Platform</p>
    </div>
    """
    return send_email_alert(to_email, subject, html)


def send_high_risk_batch_alert(agent_emails: List[str], session_name: str, high_risk_count: int, rev_at_risk: float, assignee_name: str = "", assignment_note: str = "") -> None:
    if not agent_emails:
        return

    subject = f"🚨 Action Required: {high_risk_count} High-Risk Accounts Assigned (${rev_at_risk:,.0f}/mo at risk)"
    
    note_html = ""
    if assignment_note:
        note_html = f"""
        <div style="background: #334155; padding: 12px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-size: 13px; color: #cbd5e1;"><strong>Manager Note:</strong></p>
            <p style="margin: 5px 0 0 0; font-style: italic;">"{assignment_note}"</p>
        </div>
        """

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #ff4d4f;">🚨 High-Risk Retention Queue Alert</h2>
        <p>Hello {assignee_name or 'Agent'},</p>
        <p>A new high-risk customer batch has been specifically assigned to your queue.</p>
        {note_html}
        <div style="background: #1e293b; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ff4d4f;">
            <p style="margin: 0;"><strong>Session:</strong> {session_name}</p>
            <p style="margin: 5px 0 0 0;"><strong>High-Risk Accounts:</strong> {high_risk_count}</p>
            <p style="margin: 5px 0 0 0;"><strong>Total Revenue at Risk:</strong> ${rev_at_risk:,.2f} / month</p>
        </div>
        <p>Please log in to your dashboard, review the SHAP risk drivers, and initiate retention outreach.</p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">Enterprise Churn Intelligence Platform</p>
    </div>
    """
    for email in agent_emails:
        send_email_alert(email, subject, html)


def send_manager_milestone_alert(manager_email: str, agent_name: str, customer_id: str, monthly_saved: float) -> bool:
    subject = f"🎉 Revenue Saved Milestone: ${monthly_saved:,.0f}/mo secured by {agent_name}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #20d489;">💰 Retention Milestone: Account Converted!</h2>
        <p>Great news! An at-risk customer has been successfully converted.</p>
        <div style="background: #1e293b; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #20d489;">
            <p style="margin: 0;"><strong>Customer ID:</strong> {customer_id}</p>
            <p style="margin: 5px 0 0 0;"><strong>Monthly Revenue Saved:</strong> ${monthly_saved:,.2f} / month</p>
            <p style="margin: 5px 0 0 0;"><strong>Converted by:</strong> {agent_name}</p>
        </div>
        <p>The dashboard KPIs have been updated to reflect this financial win.</p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">Enterprise Churn Intelligence Platform</p>
    </div>
    """
    return send_email_alert(manager_email, subject, html)
