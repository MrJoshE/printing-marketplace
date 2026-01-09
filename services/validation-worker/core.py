import abc
import concurrent.futures
import logging
import multiprocessing
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Coroutine, Dict, Generic, List, Optional

import trimesh
from annotated_types import T
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


class TransientError(Exception):
    """Failures that might succeed if retried (Network, DB lock, S3 500)."""

    pass


class PermanentError(Exception):
    """Failures that will never succeed (Bad data, missing file, logic error)."""

    pass


class S3Config(BaseSettings):
    endpoint_url: str = Field(..., alias="S3_ENDPOINT")
    access_key: str = Field(..., alias="VALIDATION_WORKER_S3_ACCESS_KEY")
    secret_key: str = Field(..., alias="VALIDATION_WORKER_S3_SECRET_ACCESS_KEY")


class NATSConfig(BaseSettings):
    endpoint: str = Field(..., alias="NATS_ENDPOINT")
    nack_delay_seconds: float = Field(5.0, alias="VALIDATION_WORKER_NACK_DELAY_SECONDS")


class PostgresConfig(BaseSettings):
    dsn: str = Field(..., alias="DB_DSN")


class EventsConfig(BaseSettings):
    incoming_validation: str = Field(..., alias="VALIDATION_WORKER_EVENT_SUBJECT")
    index_listing: str = Field(..., alias="EVENT_INDEX_LISTING")


class EnvironmentConfig(abc.ABC):
    events: EventsConfig = Field(default_factory=lambda: EventsConfig())  # type: ignore


class ProductionConfig(BaseSettings, EnvironmentConfig):
    s3: S3Config = Field(default_factory=lambda: S3Config())  # type: ignore
    nats: NATSConfig = Field(default_factory=lambda: NATSConfig())  # type: ignore
    postgres: PostgresConfig = Field(default_factory=lambda: PostgresConfig())  # type: ignore
    validation_concurrency: int = Field(10, alias="VALIDATION_WORKER_CONCURRENCY")
    worker_name: str = Field("validation-worker", alias="VALIDATION_WORKER_NAME")
    consumer_group: str = Field("validation_workers", alias="VALIDATION_WORKER_CONSUMER_GROUP")


class LocalConfig(EnvironmentConfig, BaseSettings):
    pass


@dataclass
class WorkerConfig:
    """
    Configuration for the Validation Worker.
    """

    max_concurrent_validations: int = multiprocessing.cpu_count()
    log_level: str = "INFO"


class ValidationErrorCode(str, Enum):
    # System Errors
    UNKNOWN_ERROR = "ERR_UNKNOWN"
    FILE_NOT_FOUND = "ERR_FILE_NOT_FOUND"
    FILE_READ_ERROR = "ERR_FILE_READ"

    # Validation Logic Errors
    MIME_MISMATCH = "ERR_MIME_MISMATCH"
    FILE_CORRUPT = "ERR_FILE_CORRUPT"
    DIMENSION_TOO_LARGE = "ERR_DIMENSION_TOO_LARGE"
    FILE_TOO_LARGE = "ERR_FILE_TOO_LARGE"
    MESH_LOAD_FAILURE = "ERR_MESH_LOAD_FAILURE"
    MESH_INTEGRITY_FAILURE = "ERR_MESH_INTEGRITY_FAILURE"
    MODEL_TOO_COMPLEX = "ERR_MODEL_TOO_COMPLEX"


@dataclass
class ValidationResult:
    validator_name: str
    is_valid: bool
    error_code: Optional[ValidationErrorCode] = None
    error_message: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    duration_seconds: float = 0.0


@dataclass
class AssetContext:
    """
    Holds the state of the asset being validated.
    Using a Path ensures we don't load the file into memory
    until a specific validator actually needs to open it.
    """

    file_path: Path
    trace_id: str  # Trace ID for logging and debugging
    file_type_hint: str = "unknown"  # e.g., 'image', 'model'

    # Internal caches for expensive operations
    _cached_mesh: trimesh.Trimesh | None = field(default=None, init=False, repr=False)

    @property
    def mesh(self) -> trimesh.Trimesh:
        """Lazy loader for 3D mesh, so it only loads if needed."""
        if self._cached_mesh is None:
            self._cached_mesh = trimesh.load_mesh(file_obj=str(self.file_path), force="mesh")
        return self._cached_mesh


@dataclass
class ValidationPolicy:
    """
    Defines the validation policy for assets.
    """

    max_file_size_mb: float = 100.00  # in megabytes
    max_model_verticies: int = 1_000_000
    max_model_faces: int = 500_000
    timeout: float = 30.0  # seconds

    # Image-specific policies
    allowed_file_types: dict[str, list[str]] = field(
        default_factory=lambda: {
            "image": ["image/jpeg", "image/png", "image/webp"],
            "model": ["model/stl", "application/octet-stream"],
        }
    )
    max_image_resolution: tuple = (4096, 4096)  # width, height


@dataclass
class ModelProcessingOutput:
    generated_image_paths: list[Path]
    original_file_path: Path


@dataclass
class ProcessingResult(Generic[T]):
    processor_name: str
    success: bool
    output_path: Optional[T] = None
    error_message: Optional[str] = None
    metadata: dict = field(default_factory=dict)


class BaseProcessor(abc.ABC):
    @abc.abstractmethod
    def process(self, context: AssetContext, additional_info: dict = {}) -> ProcessingResult:
        """
        Transforms the asset.
        Returns the path to the NEW file (or the same path if modified in place).
        """
        pass


class BaseValidator(abc.ABC):
    """
    The Contract. All validators must inherit from this.
    """

    IS_CRITICAL: bool = False  # If True, failure halts the pipeline.

    @abc.abstractmethod
    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        """
        Perform the check. Returns a ValidationResult.
        Should not raise exceptions, but catch them and return is_valid=False.
        """
        pass


class ValidationPipeline:
    def __init__(
        self, validators: List[BaseValidator], config: WorkerConfig = WorkerConfig(), logger=logging.getLogger(__name__)
    ):
        self.validators = validators
        self.max_workers = multiprocessing.cpu_count()
        self.logger = logger
        self.logger.setLevel(config.log_level)

    def run(self, context: AssetContext, policy: ValidationPolicy) -> List[ValidationResult]:
        """
        Runs all validators in parallel.
        """
        results = []

        pipeline_logger = logging.LoggerAdapter(self.logger, {"trace_id": context.trace_id})
        pipeline_logger.info(f"Starting pipeline for {context.file_path.name} ({context.file_type_hint})")

        critical_validators = [v for v in self.validators if v.IS_CRITICAL]

        for validator in critical_validators:
            res = self._execute_validator(validator, context, policy)
            results.append(res)

            if not res.is_valid:
                pipeline_logger.warning(f"Critical Validator {res.validator_name} Failed. Aborting pipeline.")
                return results

        standard_validators = [v for v in self.validators if not v.IS_CRITICAL]

        if not standard_validators:
            return results

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_validator = {
                executor.submit(self._execute_validator, v, context, policy): v for v in standard_validators
            }

            for future in concurrent.futures.as_completed(future_to_validator):
                validator_name = future_to_validator[future].__class__.__name__
                try:
                    res = future.result()
                    results.append(res)
                    pipeline_logger.info(f"Validator {validator_name} finished in {res.duration_seconds:.4f}s")
                except Exception as exc:
                    pipeline_logger.error(f"Validator {validator_name} crashed: {exc}", exc_info=True)
                    results.append(
                        ValidationResult(
                            validator_name=validator_name, is_valid=False, error_message=f"Pipeline Crash: {str(exc)}"
                        )
                    )

        return results

    @staticmethod
    def _execute_validator(
        validator: BaseValidator, context: AssetContext, policy: ValidationPolicy
    ) -> ValidationResult:
        # 1. Setup Timer
        start_time = time.perf_counter()

        # 2. Run Validator
        try:
            # We rely on the validator to handle its own logging,
            # or we could set up a worker-level LoggerAdapter here if needed.
            result = validator.validate(context, policy)
        except Exception as e:
            # Catch uncaught exceptions from validator implementation
            result = ValidationResult(
                validator_name=validator.__class__.__name__,
                is_valid=False,
                error_message=f"Uncaught Exception: {str(e)}",
            )

        # 3. Stop Timer & Attach
        end_time = time.perf_counter()
        result.duration_seconds = end_time - start_time

        return result

    def print_summary(self, results: List[ValidationResult]):
        """
        Prints a CLI-friendly report. Great for local dev/debugging.
        """
        print("\n" + "=" * 60)
        print("VALIDATION REPORT")
        print("=" * 60)

        all_passed = all(r.is_valid for r in results)
        status_icon = "✅" if all_passed else "❌"

        print(f"Overall Status: {status_icon} {'PASSED' if all_passed else 'FAILED'}")
        print("-" * 60)

        for r in results:
            icon = "✅" if r.is_valid else "❌"
            # Format time to ms
            time_str = f"{r.duration_seconds * 1000:.2f}ms"
            print(f"{icon} [{time_str}] {r.validator_name}")

            if not r.is_valid:
                print(f"   Code:    {r.error_code.value if r.error_code else 'N/A'}")
                print(f"   Message: {r.error_message}")

            # Print metadata if it exists (useful for debugging values)
            if r.metadata:
                print(f"   Context: {r.metadata}")

            print("-" * 20)


class BaseEvent(BaseModel):
    """
    All events must inherit from this.
    Auto-generates timestamp and enforces structure.
    """

    event_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    topic: str

    class ConfigDict:
        frozen = True  # Make events immutable


# --- Domain Events ---


class IndexListingEvent(BaseEvent):
    topic: str
    listing_id: str


class DeadLetterEvent(BaseEvent):
    topic: str
    original_event: dict
    reason: str
    latest_error: Optional[str] = None


# Message Handler Type Hint
class IncomingMessage(abc.ABC):
    data: Dict[str, Any]

    @abc.abstractmethod
    async def ack(self) -> None:
        pass

    @abc.abstractmethod
    async def nak(self, delay: float = 0) -> None:
        """
        Negative Acknowledgment with optional delay before redelivery.
        delay - seconds to wait before redelivery.
        """
        pass


MessageHandler = Callable[[IncomingMessage], Coroutine[Any, Any, None]]


class EventBus(abc.ABC):
    """Abstracts NATS/Kafka/RabbitMQ"""

    @abc.abstractmethod
    async def publish(self, event: BaseEvent):
        pass

    @abc.abstractmethod
    async def subscribe(self, topic: str, handler: MessageHandler, max_messages: int = 0, manual_ack: bool = False):
        """
        Subscribe to a topic. The handler receives a IncomingMessage,
        which wraps the raw message and provides ack/nak methods.
        """
        pass


class ListingRepository(abc.ABC):
    @abc.abstractmethod
    async def complete_file_validation(
        self,
        file_id: str,
        listing_id: str,
        new_file_key: str | None,
        generated_image_paths: list[str] = [],
        file_warning: str | None = None,
        metadata: dict = {},
    ) -> bool:
        """
        Atomically updates file status and checks if listing is complete.
        Returns True if the listing was just activated.
        """
        pass

    @abc.abstractmethod
    async def mark_file_invalid(self, file_id: str, error: str) -> None:
        pass

    @abc.abstractmethod
    async def mark_file_failed(self, file_id: str, error: str) -> None:
        pass
