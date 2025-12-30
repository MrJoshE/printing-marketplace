import asyncpg

from core import ListingRepository


class PostgresListingRepository(ListingRepository):
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def complete_file_validation(self, file_id: str, listing_id: str, new_file_key: str | None) -> bool:
        """
        Marks file as VALID, updates its S3 key to the new WebP version,
        and checks if the listing can be activated.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1. Lock listing
                await conn.execute("SELECT 1 FROM listings WHERE id=$1 FOR UPDATE", listing_id)

                # 2. Update File: Set status VALID and update the Key to the new WebP location
                if new_file_key is not None:
                    await conn.execute(
                        "UPDATE listing_files SET status='VALID', file_path=$1 WHERE id=$2", new_file_key, file_id
                    )
                else:
                    await conn.execute("UPDATE listing_files SET status='VALID' WHERE id=$1", file_id)

                # 3. Check for ANY pending files
                pending_count = await conn.fetchval(
                    "SELECT count(*) FROM listing_files WHERE listing_id=$1 AND status = 'PENDING'", listing_id
                )

                if pending_count and pending_count > 0:
                    return False  # Still working on other files

                # 4. Check for failures
                failed_count = await conn.fetchval(
                    "SELECT count(*) FROM listing_files WHERE listing_id=$1 AND status = 'FAILED'", listing_id
                )

                if failed_count and failed_count > 0:
                    # REJECT listing if any file failed
                    await conn.execute("UPDATE listings SET status='REJECTED' WHERE id=$1", listing_id)
                    return False
                else:
                    # ALL CLEAR -> ACTIVATE
                    await conn.execute(
                        "UPDATE listings SET status='ACTIVE' WHERE id=$1 AND status != 'ACTIVE'", listing_id
                    )
                    return True

    async def mark_file_failed(self, file_id: str, error: str) -> None:
        await self.pool.execute(
            "UPDATE listing_files SET status='FAILED', error_message=$1 WHERE id=$2", error, file_id
        )
