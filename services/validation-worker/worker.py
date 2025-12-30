import asyncio
import json
import logging
import signal
import uuid
from pathlib import Path

from core import (
    AssetContext,
    EnvironmentConfig,
    EventBus,
    IncomingMessage,
    IndexListingEvent,
    ListingRepository,
    PermanentError,
    ProcessingResult,
    ProductionConfig,
    TransientError,
    ValidationPipeline,
    ValidationPolicy,
)
from processors.image_normalizer import WebPNormalizationProcessor
from providers import FileProvider, LocalFileProvider, S3FileProvider
from validators.image.file_type_validator import FileTypeValidator
from validators.image.integrity_validator import ImageIntegrityValidator
from validators.image.resolution_compliance_validator import ResolutionValidator


def get_provider(config: EnvironmentConfig):
    """
    Factory to switch between Local and S3 based on ENV vars.
    Great for Docker/Production parity.
    """
    if isinstance(config, ProductionConfig):
        # Ensure all S3 config vars are set

        try:
            assert config.s3
        except AssertionError:
            raise ValueError("S3 configuration is required in production environment.")

        return S3FileProvider(
            endpoint_url=config.s3.endpoint_url,
            access_key=config.s3.access_key,
            secret_key=config.s3.secret_key,
        )

    return LocalFileProvider()


IMAGE_VALIDATION_PIPELINE = ValidationPipeline(
    validators=[
        FileTypeValidator(),  # Is it an image?
        ResolutionValidator(),  # Is it too big?
        ImageIntegrityValidator(),  # Is it broken?
    ]
)

WEBP_CONVERTER = WebPNormalizationProcessor(quality=80)

RETRY_DELAY_SECONDS = 5  # Seconds to wait before retrying on transient errors


class ValidationWorker:
    def __init__(
        self,
        provider: FileProvider,
        repository: ListingRepository,
        bus: EventBus,
        policy: ValidationPolicy = ValidationPolicy(),
        config: EnvironmentConfig = ProductionConfig(),  # type: ignore
        logger: logging.Logger = logging.getLogger(__name__),
    ):
        self.provider = provider
        self.repository = repository
        self.policy = policy
        self.logger = logger
        logging.basicConfig(
            level=logging.DEBUG, format="%(asctime)s | %(levelname)s | [%(trace_id)s] | %(name)s | %(message)s"
        )
        self.config = config
        self.bus = bus

        # Shutdown event for graceful stopping
        self.shutdown_event = asyncio.Event()
        self.concurrent_workers = self.config.validation_concurrency if isinstance(self.config, ProductionConfig) else 1

        self.semaphore = asyncio.Semaphore(self.concurrent_workers)

    async def start(self):
        """
        Main worker loop with Graceful Shutdown.
        """
        # Register Signal Handlers (SIGINT/SIGTERM) to stop elegantly
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._signal_handler)

        self.logger.info("🚀 Worker Started. Subscribing to events...")

        # Subscribe with manual acknowledgment enabled
        await self.bus.subscribe(
            self.config.events.image_validation_start,
            self.handle_job,
            max_messages=self.concurrent_workers,
            manual_ack=True,
        )
        self.logger.info(f"🚦 Concurrency Limit set to: {self.concurrent_workers} jobs")

        # Keep running until a signal is received
        await self.shutdown_event.wait()
        self.logger.info("👋 Worker shutting down...")

    def _signal_handler(self):
        self.logger.warning("🛑 Signal received! Initiating graceful shutdown...")
        self.shutdown_event.set()

    async def handle_job(self, msg: IncomingMessage):
        """
        Reliability Wrapper: Handles Ack/Nak and Error Routing.
        """
        # If 10 jobs are running, the 11th will pause right here.
        async with self.semaphore:
            # 1. Parse Data Safely
            try:
                data = msg.data
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                if isinstance(data, str):
                    data = json.loads(data)
            except json.JSONDecodeError:
                self.logger.error("🔥 FATAL: Message is not valid JSON. Discarding.")
                await msg.ack()  # Ack to remove bad message from queue
                return

            trace_id = data.get("trace_id", str(uuid.uuid4()))
            file_id = data.get("file_id")
            listing_id = data.get("listing_id")

            # Setup Contextual Logger
            job_logger = logging.LoggerAdapter(
                self.logger,
                {"trace_id": trace_id, "file_id": file_id, "listing_id": listing_id},
            )

            job_logger.info("📥 Processing Job...")

            try:
                # --- 2. Run Business Logic ---
                await self._process_logic(data, job_logger)

                # --- 3. Success ---
                job_logger.info("✅ Job Complete. Acknowledging message.")
                await msg.ack()

            except PermanentError as e:
                # --- 4. Permanent Failure (Bad Data) ---
                job_logger.error(f"❌ Permanent Failure: {e}. Marking DB as Failed.")
                # Update DB so user knows it failed
                if isinstance(file_id, str):
                    await self.repository.mark_file_failed(file_id, str(e))
                # ACK to remove from queue (we don't want to retry bad data)
                await msg.ack()

            except TransientError as e:
                # --- 5. Transient Failure (Network/DB) ---
                job_logger.warning(f"⚠️ Transient Error: {e}. Triggering Retry.")

                # Note: If using NATS JetStream, you can check metadata.num_delivered here.
                # If standard NATS, we just sleep and NAK.
                await msg.nak(delay=RETRY_DELAY_SECONDS)

            except Exception as e:
                # --- 6. Unhandled Crash ---
                job_logger.exception(f"💥 Unhandled Exception: {e}")
                await msg.nak(delay=RETRY_DELAY_SECONDS)

    async def _process_logic(self, data: dict, logger):
        """
        Pure Business Logic.
        Raises PermanentError or TransientError appropriately.
        """
        file_id = data.get("file_id")
        user_id = data.get("user_id")
        file_key = data.get("file_key")
        listing_id = data.get("listing_id")
        file_type = data.get("file_type")

        # --- Validation (Permanent Errors) ---
        if not file_type or file_type != "image":
            raise PermanentError(f"Unsupported file type: {file_type} only 'image' is supported.")

        if not file_id or not listing_id or not file_key or not user_id:
            raise PermanentError("Missing required fields (file_id, listing_id, user_id, or file_key)")

        # --- Pipeline Execution (CPU Bound) ---
        # We assume _run_pipeline catches internal ValueErrors and returns a ProcessingResult
        result = await asyncio.to_thread(self._run_pipeline, file_key, self.provider)

        if not result.success:
            # If validation failed (e.g. "Image too big"), that's permanent.
            raise PermanentError(result.error_message or "Validation Pipeline Failed")

        # --- File Upload (Network Bound - Transient Risk) ---
        new_file_path = getattr(result, "output_path", None)  # Ensure your processor sets this
        new_public_key: str | None = None

        if new_file_path:
            new_public_key = f"{user_id}/{listing_id}/{file_id}{new_file_path.suffix}"
            try:
                logger.info(f"Uploading new file: {new_file_path} to {new_public_key}")
                await asyncio.to_thread(self.provider.store_file, new_file_path, new_public_key)
            except Exception as e:
                # S3 is down?
                raise TransientError(f"Storage Upload Failed: {e}")
            finally:
                # Cleanup is critical
                Path(new_file_path).unlink(missing_ok=True)
        else:
            # Pipeline succeeded but produced no file?
            raise PermanentError("Pipeline succeeded but returned no output path.")

        # --- DB Update (Network Bound - Transient Risk) ---
        try:
            is_finished = await self.repository.complete_file_validation(file_id, listing_id, new_public_key)
        except Exception as e:
            # DB connection lost?
            raise TransientError(f"Database update failed: {e}")

        if is_finished:
            logger.info(f"Listing {listing_id} is complete! Publishing index event.")
            # Notify other services that listing is ready to be indexed
            event = IndexListingEvent(topic=self.config.events.index_listing, listing_id=listing_id)
            try:
                await self.bus.publish(event)
            except Exception as e:
                logger.error(f"Failed to publish IndexListingEvent: {e}")

    def _run_pipeline(self, file_key: str, provider: FileProvider) -> ProcessingResult:
        with provider.get_file(file_key) as path:
            context = AssetContext(file_path=path, file_type_hint="image", trace_id=file_key)
            self.logger.info(f"🚀 Starting validation pipeline for file ID: {file_key}")

            results = IMAGE_VALIDATION_PIPELINE.run(context, self.policy)

            failure = next((r for r in results if not r.is_valid), None)
            if failure:
                self.logger.warning(f"❌ Validation Failed: {failure.error_message}")
                return ProcessingResult(
                    processor_name="ValidationPipeline",
                    success=False,
                    error_message=f"Validation failed in {failure.validator_name}: {failure.error_message}",
                )

            # Ensure WEBP_CONVERTER returns a ProcessingResult with 'output_path' set!
            process_result = WEBP_CONVERTER.process(context)

        return process_result
