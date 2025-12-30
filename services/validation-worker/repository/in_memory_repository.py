from typing import Any, Dict, List

from core import ListingRepository


class InMemoryRepository(ListingRepository):
    def __init__(self):
        # internal storage mimicking DB tables
        # file_id -> {"status": "PENDING"|"VALID"|"FAILED", "listing_id": "...", "error": "..."}
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

    async def complete_file_validation(self, file_id: str, listing_id: str, new_file_key: str | None) -> bool:
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
        else:
            # Mimic DB behavior: if row doesn't exist, nothing happens
            return False

        # 2. Check PENDING Count (The "Fan-In" Index Scan)
        # Scan all files belonging to this listing
        pending_count = sum(
            1 for f in self.files.values() if f["listing_id"] == listing_id and f["status"] == "PENDING"
        )

        if pending_count > 0:
            return False  # Still waiting for other workers

        # 3. Work is Done (Pending == 0). Determine Outcome.
        failed_count = sum(1 for f in self.files.values() if f["listing_id"] == listing_id and f["status"] == "FAILED")

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

    async def mark_file_failed(self, file_id: str, error: str) -> None:
        """
        Simulates updating the file status to FAILED
        """
        if file_id in self.files:
            self.files[file_id]["status"] = "FAILED"
            self.files[file_id]["error"] = error
