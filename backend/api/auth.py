from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from passlib.context import CryptContext
import jwt
import datetime

from database import get_db, engine, Base
from models.user import User

Base.metadata.create_all(bind=engine)

router = APIRouter()

SECRET_KEY = "cinnamon_app_key"
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Request Schemas
class AuthRequest(BaseModel):
    phone: str = Field(..., example="+94771234567")
    pin: str = Field(..., min_length=4, max_length=4, example="1234")

class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    phone: str

def create_access_token(data: dict):
    to_encode = data.copy()
    # 60-day token expiration for offline-first resilience
    expire = datetime.datetime.utcnow() + datetime.timedelta(days=60)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/register", response_model=AuthResponse)
def register(request: AuthRequest, db: Session = Depends(get_db)):
    # 1. Check if user already exists
    existing_user = db.query(User).filter(User.phone == request.phone).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number is already registered."
        )

    # 2. Hash the 4-digit PIN
    hashed_pin = pwd_context.hash(request.pin)

    # 3. Save to database
    new_user = User(phone=request.phone, pin_hash=hashed_pin)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 4. Generate JWT
    token = create_access_token({"sub": new_user.phone, "user_id": new_user.id})
    return AuthResponse(access_token=token, token_type="bearer", phone=new_user.phone)

@router.post("/login", response_model=AuthResponse)
def login(request: AuthRequest, db: Session = Depends(get_db)):
    # 1. Find user by phone
    user = db.query(User).filter(User.phone == request.phone).first()
    if not user or not pwd_context.verify(request.pin, user.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone number or PIN."
        )

    # 2. Generate JWT
    token = create_access_token({"sub": user.phone, "user_id": user.id})
    return AuthResponse(access_token=token, token_type="bearer", phone=user.phone)