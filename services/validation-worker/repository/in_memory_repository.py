from typing import Any, Dict, List

from core import ListingRepository


class InMemoryRepository(ListingRepository):
    def __init__(self):
        # internal storage mimicking DB tables
        # file_id -> {"status": "PENDING"|"VALID"|"INVALID"|"FAILED", "listing_id": "...", "error": "..."}
        self.files: Dict[str, Dict[str, Any]] = {}

        # listing_id -> {"status": "PENDING_VALIDATION"|"ACTIVE"|"REJECTED", "id": "..."}
        self.listings: Dict[str, Dict[str, Any]] = {}

    def seed(self, listing_id: str, file_ids: List[str], initial_status="PENDING_VALIDATION"):
        """
        Helper method to setup test state (creating the 'listing' and 'files')
        """
        self.listings[listing_id] = {"status": initial_status, "id": listing_id}

        for fid in file_ids:
            self.files[fid] = {"id": fid, "listing_id": listing_id, "status": "PENDING", "error": None}

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
        Simulates the atomic Postgres transaction:
        1. Updates file to VALID.
        2. Checks remaining PENDING files.
        3. If done, Checks FAILED files to decide ACTIVE vs REJECTED.
        Returns: True if the listing was transitioned to ACTIVE by this call.
        """

        # 1. Update the File
        if file_id in self.files:
            self.files[file_id]["status"] = "VALID"
            if new_file_key is not None:
                self.files[file_id]["file_path"] = new_file_key
            if file_warning is not None:
                self.files[file_id]["error"] = file_warning
        else:
            # Mimic DB behavior: if row doesn't exist, nothing happens
            return False

        if generated_image_paths:
            # Simulate inserting generated files
            for gen_path in generated_image_paths:
                gen_file_id = f"gen-{len(self.files) + 1}"
                self.files[gen_file_id] = {
                    "id": gen_file_id,
                    "file_path": gen_path,
                    "listing_id": listing_id,
                    "status": "VALID",
                    "error": None,
                }

        # 2. Check PENDING Count (The "Fan-In" Index Scan)
        # Scan all files belonging to this listing
        pending_count = sum(
            1 for f in self.files.values() if f["listing_id"] == listing_id and f["status"] == "PENDING"
        )

        if pending_count > 0:
            return False  # Still waiting for other workers

        # 3. Work is Done (Pending == 0). Determine Outcome.
        failed_count = sum(
            1
            for f in self.files.values()
            if f["listing_id"] == listing_id and (f["status"] == "FAILED" or f["status"] == "INVALID")
        )

        if failed_count > 0:
            # REJECT logic
            self.listings[listing_id]["status"] = "REJECTED"
            return False
        else:
            # ACTIVATE logic (Idempotent check)
            current_status = self.listings[listing_id]["status"]

            if current_status != "ACTIVE":
                self.listings[listing_id]["status"] = "ACTIVE"
                return True  # We successfully activated it

            return False  # Was already active

    async def mark_file_invalid(self, file_id: str, error: str) -> None:
        """
        Simulates updating the file status to FAILED
        """
        if file_id in self.files:
            self.files[file_id]["status"] = "INVALID"
            self.files[file_id]["error"] = error

    async def mark_file_failed(self, file_id: str, error: str) -> None:
        """
        Simulates updating the file status to FAILED
        """
        if file_id in self.files:
            self.files[file_id]["status"] = "FAILED"
            self.files[file_id]["error"] = error
