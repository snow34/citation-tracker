import httpx

from app.config import get_settings
from app.core.exceptions import UpstreamError


async def send_password_reset_email(to_email: str, reset_url: str) -> None:
    settings = get_settings()
    payload = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": "Reset your Citation Tracker password",
        "html": (
            "<p>Someone requested a password reset for this email address on "
            "Citation Tracker.</p>"
            f'<p><a href="{reset_url}">Click here to choose a new password</a></p>'
            "<p>This link expires in 30 minutes. If you didn't request this, "
            "you can safely ignore this email.</p>"
        ),
    }
    headers = {"Authorization": f"Bearer {settings.resend_api_key}"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.resend.com/emails", json=payload, headers=headers
            )
    except httpx.HTTPError as exc:
        raise UpstreamError(f"Failed to reach Resend: {exc}") from exc

    if response.status_code >= 400:
        raise UpstreamError(f"Resend returned an error ({response.status_code})")
