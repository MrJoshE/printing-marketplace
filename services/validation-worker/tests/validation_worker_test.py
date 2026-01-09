from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from core import IncomingMessage, ProductionConfig

# Import your actual classes
from worker import ProcessingResult, ValidationWorker


# --- 1. Mock Message Wrapper ---
class MockIncomingMessage(IncomingMessage):
    """
    Simulates a NATS message.
    Tracks if ack() or nak() was called.
    """

    def __init__(self, data: dict):
        self.data = data
        self.acked = False
        self.naked = False
        self.nak_delay = 0

    async def ack(self):
        self.acked = True

    async def nak(self, delay=None):
        self.naked = True
        self.nak_delay = delay


# --- 2. Test Fixtures ---


@pytest.fixture
def mock_provider():
    provider = MagicMock()
    # Context manager mock for get_file
    provider.get_file.return_value.__enter__.return_value = Path("/tmp/fake_image.jpg")
    provider.store_image = MagicMock()
    provider.store_product_file = MagicMock()
    return provider


@pytest.fixture
def mock_repo():
    repo = AsyncMock()
    repo.complete_file_validation.return_value = True  # Default to success
    return repo


@pytest.fixture
def in_memory_bus():
    # We use your provided InMemoryEventBus, but slight tweak needed for tests
    # to support the new 'manual_ack' param if you updated the class.
    from events.in_memory_event_bus import InMemoryEventBus

    return InMemoryEventBus()


@pytest.fixture
def worker(mock_provider, mock_repo, in_memory_bus):
    worker = ValidationWorker(
        provider=mock_provider,
        repository=mock_repo,
        bus=in_memory_bus,
        config=ProductionConfig(),  # type: ignore  or a MockConfig
    )
    # Mock the internal pipeline & converter to avoid actual processing
    worker._run_image_pipeline = MagicMock()
    worker._run_model_pipeline = MagicMock()
    return worker


@pytest.mark.asyncio
async def test_worker_happy_path_image(worker, in_memory_bus, mock_repo, mock_provider):
    """
    Scenario: Valid image, pipeline succeeds, upload succeeds.
    Expectation: Message ACKed, DB Updated, Event Published.
    """
    # 1. Setup
    payload = {
        "trace_id": "123",
        "file_id": "file_abc",
        "listing_id": "list_xyz",
        "user_id": "user_1",
        "file_key": "raw/img.jpg",
        "file_type": "image",
    }
    msg = MockIncomingMessage(payload)

    # Mock Pipeline Success
    success_result = ProcessingResult(processor_name="Test", success=True, error_message=None)
    # Important: Attach the output_path attribute expected by the worker
    success_result.output_path = Path("/tmp/output.webp")
    worker._run_image_pipeline.return_value = success_result

    # 2. Run
    # Manually trigger the handler (bypassing the bus loop for unit testing)
    await worker.handle_job(msg)

    # 3. Assertions
    assert msg.acked is True, "Message should be ACKed on success"
    assert msg.naked is False

    # Verify Upload happened
    mock_provider.store_image.assert_called_once()

    # Verify DB Updated
    mock_repo.complete_file_validation.assert_called_with(
        "file_abc",
        "list_xyz",
        "user_1/list_xyz/file_abc.webp",
        generated_image_paths=[],
        file_warning=None,
        metadata={},
    )

    # Verify Success Event Published
    assert len(in_memory_bus.published_messages) == 1
    assert in_memory_bus.published_messages[0][0] == worker.config.events.index_listing  # or whatever your topic is


@pytest.mark.asyncio
async def test_worker_transient_failure_retries(worker, mock_provider):
    """
    Scenario: Upload to S3 fails (Network Error).
    Expectation: Message NAKed (so it retries).
    """
    # 1. Setup
    payload = {
        "trace_id": "123",
        "file_id": "file_abc",
        "listing_id": "list_xyz",
        "user_id": "user_1",
        "file_key": "raw/img.jpg",
        "file_type": "image",
    }
    msg = MockIncomingMessage(payload)

    # Mock Pipeline Success
    success_result = ProcessingResult(processor_name="Test", success=True)
    success_result.output_path = Path("/tmp/output.webp")
    worker._run_image_pipeline.return_value = success_result

    # Mock S3 Failure (Transient)
    mock_provider.store_image.side_effect = Exception("S3 Connection Reset")

    # 2. Run
    await worker.handle_job(msg)

    # 3. Assertions
    assert msg.acked is False
    assert msg.naked is True, "Message should be NAKed on transient error"
    assert msg.nak_delay == 5, "Should wait 5s before retry"


@pytest.mark.asyncio
async def test_worker_permanent_failure_no_retry(worker, mock_repo):
    """
    Scenario: Invalid Data (Missing file_id).
    Expectation: Message ACKed (don't retry garbage), DB marked failed.
    """
    # 1. Setup - Missing 'file_id'
    payload = {
        "trace_id": "123",
        "listing_id": "list_xyz",
        "user_id": "user_1",
        "file_key": "raw/img.jpg",
        "file_type": "image",
    }
    msg = MockIncomingMessage(payload)

    # 2. Run
    await worker.handle_job(msg)

    # 3. Assertions
    assert msg.acked is True, "Bad data should be ACKed to clear the queue"
    assert msg.naked is False

    # DB should NOT be updated via mark_file_failed because the ID was missing!
    # (Or depending on your logic, if file_id is missing, we might just log and ack)
    # Let's test a different permanent error: Validation Failed


@pytest.mark.asyncio
async def test_worker_validation_failure(worker, mock_repo):
    """
    Scenario: File ID exists, but Image Validation Fails (e.g. corrupted).
    Expectation: Message ACKed (don't retry), DB marked failed.
    """
    payload = {
        "trace_id": "123",
        "file_id": "file_abc",
        "listing_id": "list_xyz",
        "user_id": "user_1",
        "file_key": "raw/img.jpg",
        "file_type": "image",
    }
    msg = MockIncomingMessage(payload)

    # Mock Pipeline FAILURE
    fail_result = ProcessingResult(processor_name="Test", success=False, error_message="Image too large")
    worker._run_image_pipeline.return_value = fail_result

    await worker.handle_job(msg)

    assert msg.acked is True, "Validation failure is permanent, should ACK"

    # Verify DB marked as failed
    mock_repo.mark_file_invalid.assert_called_with("file_abc", "Image too large")
