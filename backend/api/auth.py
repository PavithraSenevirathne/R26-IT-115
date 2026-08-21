from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import jwt
import datetime
import bcrypt # Using bcrypt directly instead of passlib

from database import get_db, engine, Base
from models.user import User

# Ensure database tables exist
Base.metadata.create_all(bind=engine)

router = APIRouter()

SECRET_KEY = "cinnamon_app_key"
ALGORITHM = "HS256"

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
    expire = datetime.datetime.utcnow() + datetime.timedelta(days=60)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/register", response_model=AuthResponse)
def register(request: AuthRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.phone == request.phone).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number is already registered."
        )

    salt = bcrypt.gensalt()
    hashed_pin = bcrypt.hashpw(request.pin.encode('utf-8'), salt).decode('utf-8')

    new_user = User(phone=request.phone, pin_hash=hashed_pin)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": new_user.phone, "user_id": new_user.id})
    return AuthResponse(access_token=token, token_type="bearer", phone=new_user.phone)

@router.post("/login", response_model=AuthResponse)
def login(request: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone == request.phone).first()
    
    if not user or not bcrypt.checkpw(request.pin.encode('utf-8'), user.pin_hash.encode('utf-8')):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone number or PIN."
        )

    token = create_access_token({"sub": user.phone, "user_id": user.id})
    return AuthResponse(access_token=token, token_type="bearer", phone=user.phone)