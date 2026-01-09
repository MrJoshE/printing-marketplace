from typing import Optional


class AgentError(Exception):
    """
    Base class for all application-specific exceptions.
    captures the original exception for debugging if needed.
    """

    def __init__(self, message: str, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.original_error = original_error


# --- Domain Exceptions (Logic Failures) ---


class GenerationError(AgentError):
    """
    Raised when the AI Model Provider (Tripo/OpenAI) fails.
    Likely a 502 Bad Gateway or 503 Service Unavailable from their end.
    """

    pass


class RepairError(AgentError):
    """
    Raised when the geometry cannot be fixed (e.g., mesh is too broken).
    This usually implies the job should NOT be retried.
    """

    pass


class ValidationException(AgentError):
    """
    Raised when input parameters are invalid (e.g., negative scale).
    """

    pass


# --- Infrastructure Exceptions (System Failures) ---


class StorageError(AgentError):
    """
    Raised when S3 or Local Disk operations fail.
    Likely retryable.
    """

    pass


class JobNotFoundError(AgentError):
    """
    Raised when a user requests a Job ID that doesn't exist in Redis/Memory.
    Maps to HTTP 404.
    """

    pass
