from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User


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
