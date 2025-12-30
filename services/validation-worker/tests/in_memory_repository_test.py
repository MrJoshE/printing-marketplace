import pytest

from repository.in_memory_repository import InMemoryRepository


@pytest.mark.asyncio
async def test_repo_activates_listing_only_on_last_file():
    # Setup
    repo = InMemoryRepository()
    repo.seed("listing_123", ["file_A", "file_B"])

    # 1. Validate First File
    # Expectation: False (because file_B is still PENDING)
    activated = await repo.complete_file_validation("file_A", "listing_123", None)
    assert activated is False
    assert repo.listings["listing_123"]["status"] == "PENDING_VALIDATION"

    # 2. Validate Second File
    # Expectation: True (Last one done, no errors)
    activated = await repo.complete_file_validation("file_B", "listing_123", None)
    assert activated is True
    assert repo.listings["listing_123"]["status"] == "ACTIVE"


@pytest.mark.asyncio
async def test_repo_rejects_listing_if_any_file_fails():
    # Setup
    repo = InMemoryRepository()
    repo.seed("listing_bad", ["file_A", "file_B"])

    # 1. Fail First File
    await repo.mark_file_failed("file_A", "Corrupt Data")

    # 2. Validate Second File (The last one to finish)
    # Expectation: False (It finishes, but because file_A is INVALID, listing becomes REJECTED)
    activated = await repo.complete_file_validation("file_B", "listing_bad", None)

    assert activated is False
    assert repo.listings["listing_bad"]["status"] == "REJECTED"
