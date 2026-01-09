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
    ModelProcessingOutput,
    PermanentError,
    ProcessingResult,
    ProductionConfig,
    TransientError,
    ValidationPipeline,
    ValidationPolicy,
)
from processors.image_normalizer import WebPNormalizationProcessor
from processors.model_renderer import ModelRendererProcessor
from providers import FileProvider, LocalFileProvider, S3FileProvider
from validators.image.image_file_type_validator import ImageFileTypeValidator
from validators.image.integrity_validator import ImageIntegrityValidator
from validators.image.resolution_compliance_validator import ResolutionValidator
from validators.model.file_size_validator import FileSizeValidator
from validators.model.mesh_load_validator import MeshLoadValidator
from validators.model.model_complexity_validator import ModelComplexityValidator
from validators.model.model_file_type_validator import ModelFileTypeValidator


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


MODEL_VALIDATION_PIPELINE = ValidationPipeline(
    validators=[
        FileSizeValidator(),  # Is it too big?
        ModelFileTypeValidator(),  # Is it a model file?
        MeshLoadValidator(),  # Is it corrupted?
        ModelComplexityValidator(),  # Is it too complex? (too many polygons)
    ]
)

IMAGE_VALIDATION_PIPELINE = ValidationPipeline(
    validators=[
        FileSizeValidator(),  # Is the file it too big?
        ImageFileTypeValidator(),  # Is it an image?
        ResolutionValidator(),  # Is the resolution too big?
        ImageIntegrityValidator(),  # Is it broken?
    ]
)

WEBP_CONVERTER = WebPNormalizationProcessor(quality=80)
MODEL_RENDERER = ModelRendererProcessor()
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

    async def handle_system_failure(self, msg: IncomingMessage, error: Exception):
        file_id = msg.data.get("file_id")
        if file_id is None:
            self.logger.error("🚨 No file_id in message; cannot mark file as FAILED")
            return

        try:
            self.logger.error(f"🚨 Marking File {file_id} as FAILED due to system error. {str(error)}")

            # Update DB status to 'FAILED' (Distinct from 'INVALID')
            # 'FAILED' implies: "It's not you, it's us. Try again later."
            await self.repository.mark_file_failed(
                file_id, error="Internal error during processing. We are investigating"
            )
        except Exception:
            self.logger.exception("CRITICAL: Failed to update DB during system failure handling. ")

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
            self.config.events.incoming_validation,
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
                    await self.repository.mark_file_invalid(file_id, str(e))
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

    async def _process_logic(self, data: dict, logger: logging.LoggerAdapter):
        """
        Pure Business Logic.
        Raises PermanentError or TransientError appropriately.
        """
        file_id = data.get("file_id")
        user_id = data.get("user_id")
        file_key = data.get("file_key")
        listing_id = data.get("listing_id")
        file_type = data.get("file_type")

        if not file_id or not listing_id or not file_key or not user_id:
            raise PermanentError("Missing required fields (file_id, listing_id, user_id, or file_key)")

        # --- Pipeline Execution (CPU Bound) ---
        # We assume _run_pipeline catches internal ValueErrors and returns a ProcessingResult
        result: ProcessingResult
        match file_type:
            case "image":
                result = self._run_image_pipeline(file_key, self.provider)
            case "model":
                # result = self._run_model_pipeline(file_key, self.provider)
                result = self._run_model_pipeline(
                    file_key,
                    self.provider,
                )
            case _:
                raise PermanentError(f"Unsupported file type for processing: {file_type}")

        if not result.success:
            # If validation failed (e.g. "Image too big"), that's permanent.
            raise PermanentError(result.error_message or "Validation Pipeline Failed")

        # --- File Upload (Network Bound - Transient Risk) ---
        new_storage_key: str | None = None
        generated_files_storage_keys: list[str] = []
        if file_type == "image":
            new_storage_key = await self._handle_image_completion(
                result=result,
                user_id=user_id,
                listing_id=listing_id,
                file_id=file_id,
                logger=logger,
            )
        elif file_type == "model":
            generated_files_storage_keys, new_storage_key = await self._handle_model_completion(
                result=result, user_id=user_id, listing_id=listing_id, file_id=file_id, logger=logger
            )

        # --- DB Update (Network Bound - Transient Risk) ---
        try:
            is_finished = await self.repository.complete_file_validation(
                file_id,
                listing_id,
                new_storage_key,
                generated_image_paths=generated_files_storage_keys,
                file_warning=result.error_message,
                metadata=result.metadata,
            )
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

    def _run_image_pipeline(
        self,
        file_key: str,
        provider: FileProvider,
    ) -> ProcessingResult[Path]:
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
                    error_message=f"Validation failed in {failure.validator_name}: {failure.error_message}"
                    + f" Reference ID: {context.trace_id}",
                )

            process_result = WEBP_CONVERTER.process(context)

        return process_result

    def _run_model_pipeline(
        self,
        file_key: str,
        provider: FileProvider,
    ) -> ProcessingResult[ModelProcessingOutput]:
        path = provider.get_file_temp(file_key)
        context = AssetContext(file_path=path, file_type_hint="model", trace_id=file_key)
        self.logger.info(f"File path: {path}")
        self.logger.info(f"🚀 Starting model validation pipeline for file ID: {file_key}")

        results = MODEL_VALIDATION_PIPELINE.run(context, self.policy)

        failure = next((r for r in results if not r.is_valid), None)
        if failure:
            self.logger.warning(f"❌ Validation Failed: {failure.error_message}")
            return ProcessingResult(
                processor_name="ModelValidationPipeline",
                success=False,
                error_message=f"Validation failed in {failure.validator_name}: {failure.error_message}"
                + f" Reference ID: {context.trace_id}",
            )

        metadata = {}
        for result in results:
            if result.metadata:
                metadata.update(result.metadata)
        self.logger.info(f"✅ Model Validation Succeeded with metadata: {metadata}")

        output = MODEL_RENDERER.process(context, additional_info=metadata)

        processing_output = ModelProcessingOutput(
            generated_image_paths=output.output_path if output.output_path else [],
            original_file_path=context.file_path,
        )

        return ProcessingResult(
            processor_name="ModelValidationPipeline",
            success=True,
            output_path=processing_output if output.success else None,
            metadata=metadata,
            error_message=output.error_message + f" Reference ID: {context.trace_id}" if output.error_message else None,
        )

    async def _handle_image_completion(
        self,
        result: ProcessingResult[Path],
        user_id: str,
        listing_id: str,
        file_id: str,
        logger: logging.LoggerAdapter,
    ):
        new_file_path = result.output_path
        if not isinstance(new_file_path, Path):
            raise PermanentError("Pipeline succeeded but returned no output path.")

        new_storage_key = f"{user_id}/{listing_id}/{file_id}{new_file_path.suffix}"
        try:
            logger.info(f"Uploading new file: {new_file_path} to {new_storage_key}")
            await asyncio.to_thread(self.provider.store_image, new_file_path, new_storage_key)
            return new_storage_key
        except Exception as e:
            # S3 is down?
            raise TransientError(f"Storage Upload Failed: {e}")
        finally:
            # Cleanup is critical
            new_file_path.unlink(missing_ok=True)

    async def _handle_model_completion(
        self,
        result: ProcessingResult[ModelProcessingOutput],
        user_id: str,
        listing_id: str,
        file_id: str,
        logger: logging.LoggerAdapter,
    ) -> tuple[list[str], str]:
        if not isinstance(result.output_path, ModelProcessingOutput):
            raise PermanentError("Pipeline succeeded but returned no output path.")

        # Upload the original validated model file to the product-files bucket
        source_file_path = result.output_path.original_file_path
        new_storage_key = f"{user_id}/{listing_id}/{file_id}{source_file_path.suffix}"
        try:
            logger.info(f"Uploading validated model file: {source_file_path} to {new_storage_key}")
            await asyncio.to_thread(self.provider.store_product_file, source_file_path, new_storage_key)
        except Exception as e:
            logger.warning(f"Failed to upload validated model file: {e}")
            raise TransientError(f"Storage Upload Failed for model file: {e}")
        finally:
            # Cleanup is critical
            source_file_path.unlink(missing_ok=True)

        generated_image_paths = result.output_path.generated_image_paths
        generated_file_storage_keys: list[str] = []
        # Upload the renders if there are any
        for _, gen_path in enumerate(generated_image_paths):
            end_of_file_path = str(gen_path).split("_")[-1]
            product_storage_key = f"{user_id}/{listing_id}/{file_id}/{end_of_file_path}"
            try:
                logger.info(f"Uploading generated file: {gen_path} to {product_storage_key}")
                await asyncio.to_thread(self.provider.store_image, gen_path, product_storage_key)
                generated_file_storage_keys.append(product_storage_key)
            except Exception as e:
                raise TransientError(f"Storage Upload Failed for generated file: {e}")
            finally:
                gen_path.unlink(missing_ok=True)

        return generated_file_storage_keys, new_storage_key
