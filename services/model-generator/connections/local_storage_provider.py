import aiofiles
from core.config import settings
from domain.interfaces import FileStorage


class LocalFileStorage(FileStorage):
    def __init__(self):
        # Ensure the directory exists
        self.base_path = settings.LOCAL_STORAGE_PATH
        self.base_path.mkdir(parents=True, exist_ok=True)

    async def upload(self, file_data: bytes, filename: str) -> str:
        """
        Saves bytes to disk and returns a static localhost URL.
        """
        file_path = self.base_path / filename

        # Ensure subdirectories exist (e.g. models/xyz.stl)
        file_path.parent.mkdir(parents=True, exist_ok=True)

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_data)

        # Return a URL that points to the Static Mount (configured in main.py)
        # Result: http://localhost:8000/static/models/xyz.stl
        return f"{settings.API_BASE_URL}/static/{filename}"
