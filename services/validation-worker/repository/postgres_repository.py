import json

import asyncpg

from core import ListingRepository


class PostgresListingRepository(ListingRepository):
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

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
        Marks file as VALID, updates its S3 key to the new WebP version,
        and checks if the listing can be activated.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                if generated_image_paths:
                    # Insert any generated files (model renders, etc)
                    for file_path in generated_image_paths:
                        await conn.execute(
                            "INSERT INTO listing_files (listing_id, file_path, file_type, status, is_generated, source_file_id) VALUES ($1, $2, 'IMAGE', 'VALID', 'TRUE', $3)",
                            listing_id,
                            file_path,
                            file_id,
                        )

                # 1. Lock listing
                await conn.execute("SELECT 1 FROM listings WHERE id=$1 FOR UPDATE", listing_id)

                # 2. Update File: Set status VALID and update the Key to the new WebP location
                if new_file_key is not None:
                    # 2.5 If the file has been updated (its an image) & it's the thumbnail, update the listing record too
                    is_thumbnail = await conn.fetchval(
                        "SELECT CASE WHEN file_path = (SELECT thumbnail_path FROM listings WHERE id=$1) THEN TRUE ELSE FALSE END FROM listing_files WHERE id=$2",
                        listing_id,
                        file_id,
                    )

                    if is_thumbnail:
                        await conn.execute(
                            "UPDATE listings SET thumbnail_path=$1 WHERE id=$2", new_file_key, listing_id
                        )

                    await conn.execute(
                        "UPDATE listing_files SET status='VALID', file_path=$1 WHERE id=$2", new_file_key, file_id
                    )

                else:
                    if file_warning is not None:
                        await conn.execute(
                            "UPDATE listing_files SET status='VALID', error_message=$1, metadata=$2 WHERE id=$3",
                            file_warning,
                            json.dumps(metadata),
                            file_id,
                        )
                    else:
                        await conn.execute(
                            "UPDATE listing_files SET status='VALID', metadata=$1 WHERE id=$2",
                            json.dumps(metadata),
                            file_id,
                        )

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

    async def mark_file_invalid(self, file_id: str, error: str) -> None:
        await self.pool.execute(
            "UPDATE listing_files SET status='INVALID', error_message=$1 WHERE id=$2", error, file_id
        )
