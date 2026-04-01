from fastapi import APIRouter, Depends, status

from app.core.user_auth import UserAuth
from app.dependencies import get_current_user, get_user_auth
from app.schemas.tokenDTO import TokenDTO
from app.schemas.userDTO import UserDTO, UserLoginDTO, UserRegisterDTO

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenDTO, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegisterDTO,
    user_auth: UserAuth = Depends(get_user_auth),
) -> TokenDTO:
    """Create a new local user account with a hashed password and signed"""
    return await user_auth.register_user(payload)


@router.post("/login", response_model=TokenDTO)
async def login(
    payload: UserLoginDTO,
    user_auth: UserAuth = Depends(get_user_auth),
) -> TokenDTO:
    """Authenticate a user and return a signed bearer token."""
    return await user_auth.login_for_access_token(payload)


@router.get("/me", response_model=UserDTO)
async def me(current_user: UserDTO = Depends(get_current_user)) -> UserDTO:
    """Return the currently authenticated user."""
    return current_user
