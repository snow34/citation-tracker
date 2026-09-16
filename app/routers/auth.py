from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageOut,
    RegisterRequest,
    ResetPasswordRequest,
    TokenOut,
)
from app.schemas.user import UserOut
from app.services.auth_service import (
    authenticate_user,
    register_user,
    request_password_reset,
    reset_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    return await register_user(db, data.email, data.password)


@router.post("/login", response_model=TokenOut)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenOut:
    token = await authenticate_user(db, data.email, data.password)
    return TokenOut(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)) -> None:
    """Stateless JWT: there is no server-side session to invalidate. The client must
    discard its token; this endpoint exists for API symmetry and future extension
    (e.g. a token denylist) rather than performing real server-side revocation."""
    return


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/forgot-password", response_model=MessageOut)
async def forgot_password(
    data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageOut:
    await request_password_reset(db, data.email)
    # Deliberately the same message whether or not the email is registered.
    return MessageOut(message="If that email is registered, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageOut)
async def reset_password_endpoint(
    data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageOut:
    await reset_password(db, data.token, data.new_password)
    return MessageOut(message="Password updated. You can now log in with your new password.")
