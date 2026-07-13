"""Sentry initialization shared by API and worker processes."""

from app.core.configs import settings


def init_sentry() -> None:
    """Initialize Sentry when a DSN is configured."""
    if not settings.sentry_dsn:
        return

    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        release=settings.sentry_release,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
        enable_logs=True,
    )
