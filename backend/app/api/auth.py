from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import LoginIn, RegisterIn, TokenOut
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


def user_to_dict(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "timezone": u.timezone, "is_developer": u.is_developer,
            "patterns": u.patterns or {}, "created_at": u.created_at.isoformat()}


@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), timezone=body.timezone)
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_access_token(user.id), user=user_to_dict(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return TokenOut(access_token=create_access_token(user.id), user=user_to_dict(user))


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)
