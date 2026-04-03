from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.contexts.identity.application.commands import (
    CreateUserCommand,
    InviteEmployeeCommand,
    LoginCommand,
    RegisterEmployeeCommand,
)
from app.contexts.identity.application.services import IdentityService
from app.contexts.identity.interfaces.http.mappers import (
    map_identity_error,
    to_admin_create_response_dto,
    to_invite_response_dto,
    to_token_dto,
)
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
    identity_service: IdentityService = Depends(get_user_auth),
) -> TokenDTO:
    """Create a new invited employee account and return a signed bearer token."""
    try:
        result = await identity_service.register_employee(
            RegisterEmployeeCommand(
                name=payload.name,
                last_name=payload.last_name,
                email=payload.email,
                password=payload.password,
                invite_token=payload.invite_token,
            )
        )
    except Exception as exc:
        raise map_identity_error(exc) from exc
    return to_token_dto(result)


@router.post("/login", response_model=TokenDTO)
async def login(
    request: Request,
    identity_service: IdentityService = Depends(get_user_auth),
) -> TokenDTO:
    """Authenticate a user from JSON or OAuth2 form fields and return a bearer token."""
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        payload = UserLoginDTO.model_validate(await request.json())
        command = LoginCommand(email=payload.email, password=payload.password)
        try:
            result = await identity_service.login(command)
        except Exception as exc:
            raise map_identity_error(exc) from exc
        return to_token_dto(result)

    if "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        payload = LoginCommand(
            email=str(form.get("username", "")).strip(),
            password=str(form.get("password", "")),
        )
        try:
            result = await identity_service.login(payload)
        except Exception as exc:
            raise map_identity_error(exc) from exc
        return to_token_dto(result)

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
    identity_service: IdentityService = Depends(get_user_auth),
) -> EmployeeInviteResponseDTO:
    """Send a Gmail invitation link for employee-only registration."""
    try:
        result = await identity_service.invite_employee(
            InviteEmployeeCommand(
                email=payload.email,
                invited_by_user_id=current_user.id,
            )
        )
    except Exception as exc:
        raise map_identity_error(exc) from exc
    return to_invite_response_dto(result)


@router.post("/admin-create-user", response_model=AdminUserCreateResponseDTO)
async def admin_create_user(
    payload: AdminUserCreateDTO,
    current_user: UserDTO = Depends(require_role([RoleEnum.SEO])),
    identity_service: IdentityService = Depends(get_user_auth),
) -> AdminUserCreateResponseDTO:
    """Allow SEO admins to create local users with a selected role."""
    try:
        result = await identity_service.create_user(
            CreateUserCommand(
                name=payload.name,
                last_name=payload.last_name,
                email=payload.email,
                password=payload.password,
                role=payload.role,
            )
        )
    except Exception as exc:
        raise map_identity_error(exc) from exc
    return to_admin_create_response_dto(result)
