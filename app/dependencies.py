import uuid

import jwt
from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError
from app.core.security import decode_access_token
from app.database import get_db
from app.models.user import User
from app.schemas.citation import SortField, SortOrder

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise UnauthorizedError("Not authenticated")

    try:
        subject = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(subject)
    except (jwt.PyJWTError, ValueError) as exc:
        raise UnauthorizedError("Invalid or expired token") from exc

    user = await db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("Invalid or expired token")
    return user


class LibraryQueryParams:
    def __init__(
        self,
        q: str | None = Query(default=None, description="Search title/authors/journal/abstract"),
        journal: str | None = Query(default=None),
        year: int | None = Query(default=None),
        read_status: str | None = Query(default=None),
        sort: SortField = Query(default=SortField.added_at),
        order: SortOrder = Query(default=SortOrder.desc),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=20, ge=1, le=100),
    ):
        self.q = q
        self.journal = journal
        self.year = year
        self.read_status = read_status
        self.sort = sort
        self.order = order
        self.page = page
        self.page_size = page_size
