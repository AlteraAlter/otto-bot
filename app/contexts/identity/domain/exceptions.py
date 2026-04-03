class IdentityError(Exception):
    """Base exception for the identity context."""


class InvalidCredentialsError(IdentityError):
    pass


class UserAlreadyExistsError(IdentityError):
    pass


class InvitationInvalidError(IdentityError):
    pass


class InvitationEmailMismatchError(IdentityError):
    pass


class InvitationEmailNotConfiguredError(IdentityError):
    pass


class InvitationDeliveryError(IdentityError):
    pass


class TokenValidationError(IdentityError):
    pass


class TokenExpiredError(TokenValidationError):
    pass


class UserNotFoundError(IdentityError):
    pass
