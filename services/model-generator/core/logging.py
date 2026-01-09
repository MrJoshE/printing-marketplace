import logging

import structlog
from opentelemetry import trace


def add_trace_context(logger, method_name, event_dict):
    """Injects current OTel Trace ID into the log JSON."""
    span = trace.get_current_span()
    if span != trace.NonRecordingSpan:
        ctx = span.get_span_context()
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict


def configure_logging(json_logs: bool = False):
    """Configures Structlog for Production (JSON) or Dev (Pretty)."""

    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        add_trace_context,  # <--- The magic sauce
        structlog.processors.StackInfoRenderer(),
    ]

    if json_logs:
        # Production: Minified JSON
        processors.append(structlog.processors.format_exc_info)
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Development: Pretty Colors
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Hijack Uvicorn's logger to use our structlog config
    logging.getLogger("uvicorn.access").handlers = []
    logging.getLogger("uvicorn.error").handlers = []
