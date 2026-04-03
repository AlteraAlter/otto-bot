import smtplib
from datetime import datetime
from email.message import EmailMessage
from urllib.parse import urlencode

from app.contexts.identity.domain.exceptions import (
    InvitationDeliveryError,
    InvitationEmailNotConfiguredError,
)


class SMTPInvitationMailer:
    def __init__(
        self,
        *,
        smtp_host: str | None,
        smtp_port: int,
        smtp_username: str | None,
        smtp_password: str | None,
        smtp_sender_email: str | None,
        smtp_use_tls: bool,
        frontend_app_url: str,
    ):
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_username = smtp_username
        self.smtp_password = smtp_password
        self.smtp_sender_email = smtp_sender_email
        self.smtp_use_tls = smtp_use_tls
        self.frontend_app_url = frontend_app_url.rstrip("/")

    def _build_invitation_link(self, *, email: str, token: str) -> str:
        return (
            f"{self.frontend_app_url}/employee-register?"
            f"{urlencode({'email': email, 'invite': token})}"
        )

    def send_employee_invitation(
        self,
        *,
        recipient_email: str,
        invitation_code: str,
        expires_at: datetime,
    ) -> None:
        if (
            not self.smtp_host
            or not self.smtp_username
            or not self.smtp_password
            or not self.smtp_sender_email
        ):
            raise InvitationEmailNotConfiguredError(
                "SMTP settings are not configured for invitation emails"
            )

        invitation_link = self._build_invitation_link(
            email=recipient_email,
            token=invitation_code,
        )
        message = EmailMessage()
        message["Subject"] = "Your OTTO employee invitation"
        message["From"] = self.smtp_sender_email
        message["To"] = recipient_email
        message.set_content(
            "\n".join(
                [
                    "You have been invited to create an OTTO employee account.",
                    "",
                    f"Complete registration here: {invitation_link}",
                    f"Invitation code: {invitation_code}",
                    "If the link does not open correctly, copy the code and paste it into the registration form.",
                    f"Invitation expires at: {expires_at.isoformat()}",
                    "",
                    "If you did not expect this email, you can ignore it.",
                ]
            )
        )

        try:
            with smtplib.SMTP(
                self.smtp_host,
                self.smtp_port,
                timeout=20,
            ) as smtp:
                if self.smtp_use_tls:
                    smtp.starttls()
                smtp.login(self.smtp_username, self.smtp_password)
                smtp.send_message(message)
        except Exception as exc:
            raise InvitationDeliveryError(
                f"Unable to send invitation email: {exc}"
            ) from exc
