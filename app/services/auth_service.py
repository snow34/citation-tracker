import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import ConflictError, UnauthorizedError, UpstreamError
from app.core.security import (
    create_access_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    verify_password,
)
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services.email_service import send_password_reset_email

logger = logging.getLogger(__name__)

RESET_TOKEN_TTL_MINUTES = 30


async def register_user(db: AsyncSession, email: str, password: str) -> User:
    email = email.lower()
    existing = await db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise ConflictError("Email is already registered")

    user = User(email=email, password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> str:
    email = email.lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid email or password")
    return create_access_token(str(user.id))


async def request_password_reset(db: AsyncSession, email: str) -> None:
    """Always completes without revealing whether the email is registered — the
    router returns the same generic message either way. If sending genuinely fails
    (e.g. a misconfigured Resend key), that's swallowed here for the same reason:
    letting it surface as a different response would itself leak that the account
    exists. It's logged instead, for whoever has access to the server logs."""
    email = email.lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        return

    token = generate_reset_token()
    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_reset_token(token),
        expires_at=datetime.now(UTC) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
    )
    db.add(reset)
    await db.commit()

    settings = get_settings()
    reset_url = f"{settings.frontend_url}/#/reset-password?token={token}"
    try:
        await send_password_reset_email(user.email, reset_url)
    except UpstreamError:
        logger.exception("Failed to send password reset email to user %s", user.id)


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    token_hash = hash_reset_token(token)
    reset = await db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    now = datetime.now(UTC)
    if reset is None or reset.used_at is not None or reset.expires_at < now:
        raise UnauthorizedError("This reset link is invalid or has expired")

    user = await db.get(User, reset.user_id)
    user.password_hash = hash_password(new_password)
    reset.used_at = now
    await db.commit()
