import uuid
from datetime import UTC, datetime, timedelta

import respx
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_reset_token, hash_reset_token
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User


@respx.mock
async def test_forgot_password_sends_email_for_known_user(
    client: AsyncClient, db_session: AsyncSession
):
    email = f"reset-{uuid.uuid4()}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "supersecret1"})

    send = respx.post("https://api.resend.com/emails").mock(return_value=Response(200, json={}))

    resp = await client.post("/auth/forgot-password", json={"email": email})
    assert resp.status_code == 200
    assert send.called

    user = await db_session.scalar(select(User).where(User.email == email))
    reset = await db_session.scalar(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    )
    assert reset is not None
    assert reset.used_at is None


@respx.mock
async def test_forgot_password_unknown_email_gives_same_response(client: AsyncClient):
    send = respx.post("https://api.resend.com/emails").mock(return_value=Response(200, json={}))

    resp = await client.post(
        "/auth/forgot-password", json={"email": "nobody-here@example.com"}
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "If that email is registered, a reset link has been sent."
    assert not send.called


@respx.mock
async def test_reset_password_with_valid_token(client: AsyncClient, db_session: AsyncSession):
    email = f"reset-{uuid.uuid4()}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "oldpassword1"})
    user = await db_session.scalar(select(User).where(User.email == email))

    token = generate_reset_token()
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(token),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
        )
    )
    await db_session.commit()

    resp = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "newpassword1"}
    )
    assert resp.status_code == 200

    # old password no longer works, new one does
    old = await client.post("/auth/login", json={"email": email, "password": "oldpassword1"})
    assert old.status_code == 401
    new = await client.post("/auth/login", json={"email": email, "password": "newpassword1"})
    assert new.status_code == 200


async def test_reset_password_rejects_unknown_token(client: AsyncClient):
    resp = await client.post(
        "/auth/reset-password", json={"token": "not-a-real-token", "new_password": "whatever1"}
    )
    assert resp.status_code == 401


async def test_reset_password_rejects_expired_token(
    client: AsyncClient, db_session: AsyncSession
):
    email = f"reset-{uuid.uuid4()}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "oldpassword1"})
    user = await db_session.scalar(select(User).where(User.email == email))

    token = generate_reset_token()
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(token),
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
    )
    await db_session.commit()

    resp = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "newpassword1"}
    )
    assert resp.status_code == 401


async def test_reset_password_rejects_reused_token(client: AsyncClient, db_session: AsyncSession):
    email = f"reset-{uuid.uuid4()}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "oldpassword1"})
    user = await db_session.scalar(select(User).where(User.email == email))

    token = generate_reset_token()
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(token),
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
        )
    )
    await db_session.commit()

    first = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "newpassword1"}
    )
    assert first.status_code == 200

    second = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "anotherpassword1"}
    )
    assert second.status_code == 401
