from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content
from .config import get_settings

settings = get_settings()


async def send_friend_invitation(to_email: str, from_user_name: str) -> bool:
    """Send a friend invitation email via SendGrid."""
    if not settings.sendgrid_api_key:
        print(f"SendGrid not configured. Would send invitation to {to_email}")
        return True

    subject = f"{from_user_name} invited you to Circle Calendar"

    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1976d2;">You've been invited to Circle Calendar!</h2>
        <p style="font-size: 16px; color: #333;">
            <strong>{from_user_name}</strong> wants to connect with you on Circle Calendar
            and share birthdays.
        </p>
        <p style="font-size: 14px; color: #666;">
            Circle Calendar is a beautiful circular calendar that helps you track
            important dates throughout the year.
        </p>
        <a href="{settings.frontend_url}"
           style="display: inline-block; background: #1976d2; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 4px; margin-top: 16px;">
            Join Circle Calendar
        </a>
        <p style="font-size: 12px; color: #999; margin-top: 24px;">
            Once you sign up, {from_user_name}'s friend request will be waiting for you.
        </p>
    </div>
    """

    try:
        message = Mail(
            from_email=Email("noreply@circlecalendar.app", "Circle Calendar"),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html_content)
        )

        sg = SendGridAPIClient(settings.sendgrid_api_key)
        response = sg.send(message)
        return response.status_code in (200, 201, 202)
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False
