from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.user_auth import UserAuth
from app.dependencies import get_current_user, get_user_auth, require_role
from app.schemas.enums import RoleEnum
from app.schemas.tokenDTO import TokenDTO
from app.schemas.userDTO import (
    AdminUserCreateDTO,
    AdminUserCreateResponseDTO,
    EmployeeInviteRequestDTO,
    EmployeeInviteResponseDTO,
    UserDTO,
    UserLoginDTO,
    UserRegisterDTO,
)

router = APIRouter(prefix="/v1/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenDTO, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegisterDTO,
    auth_service: UserAuth = Depends(get_user_auth),
) -> TokenDTO:
    """Create a new invited employee account and return a signed bearer token."""
    return await auth_service.register_user(payload)


@router.post("/login", response_model=TokenDTO)
async def login(
    request: Request,
    auth_service: UserAuth = Depends(get_user_auth),
) -> TokenDTO:
    """Authenticate a user from JSON or OAuth2 form fields and return a bearer token."""
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        payload = UserLoginDTO.model_validate(await request.json())
        return await auth_service.login_for_access_token(payload)

    if "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        payload = UserLoginDTO(
            email=str(form.get("username", "")).strip(),
            password=str(form.get("password", "")),
        )
        return await auth_service.login_for_access_token(payload)

    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Use JSON {email, password} or form fields username/password",
    )


@router.get("/me", response_model=UserDTO)
async def me(current_user: UserDTO = Depends(get_current_user)) -> UserDTO:
    """Return the currently authenticated user."""
    return current_user


@router.post("/invite-employee", response_model=EmployeeInviteResponseDTO)
async def invite_employee(
    payload: EmployeeInviteRequestDTO,
    current_user: UserDTO = Depends(require_role([RoleEnum.SEO])),
    auth_service: UserAuth = Depends(get_user_auth),
) -> EmployeeInviteResponseDTO:
    """Send a Gmail invitation link for employee-only registration."""
    return await auth_service.invite_employee(
        payload,
        invited_by_user_id=current_user.id,
    )


@router.post("/admin-create-user", response_model=AdminUserCreateResponseDTO)
async def admin_create_user(
    payload: AdminUserCreateDTO,
    auth_service: UserAuth = Depends(get_user_auth),
) -> AdminUserCreateResponseDTO:
    """Allow SEO admins to create local users with a selected role."""
    return await auth_service.admin_create_user(payload)
