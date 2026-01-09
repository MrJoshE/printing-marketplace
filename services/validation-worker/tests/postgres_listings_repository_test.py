from unittest.mock import AsyncMock, MagicMock

import asyncpg
import pytest

from repository.postgres_repository import PostgresListingRepository


# Helper to setup the mock chain: Pool -> Connection -> Transaction
@pytest.fixture
def mock_db_pool():
    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)
    tx = AsyncMock()

    # Determine what happens when we do: async with pool.acquire() as conn:
    pool.acquire.return_value.__aenter__.return_value = conn

    # Determine what happens when we do: async with conn.transaction():
    conn.transaction.return_value.__aenter__.return_value = tx

    return pool, conn


@pytest.mark.asyncio
async def test_complete_validation_updates_thumbnail_if_match(mock_db_pool):
    """
    Scenario: The file being validated IS the listing's current thumbnail.
    Expectation: The 'listings' table thumbnail_path should be updated.
    """
    pool, conn = mock_db_pool
    repo = PostgresListingRepository(pool)

    # --- MOCK RESPONSES ---
    # The code calls fetchval 3 times in this flow:
    # 1. "SELECT CASE WHEN..." (Check is_thumbnail) -> Return TRUE
    # 2. "SELECT count(*) ... PENDING"              -> Return 0 (None pending)
    # 3. "SELECT count(*) ... FAILED"               -> Return 0 (None failed)
    conn.fetchval.side_effect = [True, 0, 0]

    # --- ACTION ---
    await repo.complete_file_validation("file_123", "listing_abc", "new/path.webp")

    # --- ASSERTIONS ---

    # Check that we tried to update the listing thumbnail
    # We look through all calls to execute()
    execute_calls = [str(c) for c in conn.execute.mock_calls]

    # 1. Verify Thumbnail Update Logic
    thumbnail_update_sql = "UPDATE listings SET thumbnail_path=$1 WHERE id=$2"
    assert any(thumbnail_update_sql in cmd for cmd in execute_calls), (
        "Should execute SQL to update listing thumbnail path"
    )

    # 2. Verify File Update Logic
    file_update_sql = "UPDATE listing_files SET status='VALID', file_path=$1 WHERE id=$2"
    assert any(file_update_sql in cmd for cmd in execute_calls)


@pytest.mark.asyncio
async def test_complete_validation_skips_thumbnail_if_no_match(mock_db_pool):
    """
    Scenario: The file is just a gallery image, NOT the thumbnail.
    Expectation: The 'listings' table thumbnail_path is NOT touched.
    """
    pool, conn = mock_db_pool
    repo = PostgresListingRepository(pool)

    # --- MOCK RESPONSES ---
    # 1. Check is_thumbnail -> Return FALSE
    # 2. Check Pending      -> Return 0
    # 3. Check Failed       -> Return 0
    conn.fetchval.side_effect = [False, 0, 0]

    # --- ACTION ---
    await repo.complete_file_validation("file_123", "listing_abc", "new/path.webp")

    # --- ASSERTIONS ---
    execute_calls = [str(c) for c in conn.execute.mock_calls]

    # 1. Verify we did NOT update the listing thumbnail
    thumbnail_update_sql = "UPDATE listings SET thumbnail_path=$1"
    assert not any(thumbnail_update_sql in cmd for cmd in execute_calls), (
        "Should NOT update listing thumbnail if file does not match"
    )

    # 2. But we DID update the file status
    file_update_sql = "UPDATE listing_files SET status='VALID'"
    assert any(file_update_sql in cmd for cmd in execute_calls)
