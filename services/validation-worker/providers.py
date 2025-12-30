import abc
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import boto3


class FileProvider(abc.ABC):
    @contextmanager
    @abc.abstractmethod
    def get_file(self, id: str) -> Iterator[Path]:
        """
        Yields a Path to a local file.
        Cleanly handles setup and teardown.
        """
        pass

    @abc.abstractmethod
    def store_file(self, source_path: Path, dest_id: str) -> None:
        """
        Stores a local file to the provider's storage backend.
        E.g., upload to S3 or move to a specific local directory.
        """
        pass


class LocalFileProvider(FileProvider):
    """
    For testing and local development.
    Simply ensures the file exists and yields the path.
    """

    @contextmanager
    def get_file(self, id: str) -> Iterator[Path]:
        path = Path(id)
        if not path.exists():
            raise FileNotFoundError(f"Local file not found: {id}")
        yield path
        # No cleanup needed for local files

    def store_file(self, source_path: Path, dest_id: str) -> None:
        dest_path = Path(dest_id)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        source_path.replace(dest_path)


class S3FileProvider(FileProvider):
    """
    Downloads from S3/Minio to a temp file, yields path,
    then auto-deletes the temp file when done.
    """

    def __init__(self, endpoint_url: str, access_key: str, secret_key: str):
        # endpoint_url allows usage with Minio or LocalStack
        use_ssl = os.environ.get("S3_USE_SSL", "true").lower() == "true"

        if not endpoint_url.startswith("http://") and not endpoint_url.startswith("https://"):
            endpoint_url = "https://" if use_ssl else "http://" + endpoint_url
        s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            verify=os.environ.get("S3_USE_SSL", "true").lower() == "true",  # Disable SSL verification for local setups
        )

        if not s3_client:
            raise ValueError("Failed to create S3 client with provided credentials.")
        self.s3_client = s3_client
        self.incoming_files_bucket = "incoming-files"
        self.public_files_bucket = "public-files"

    @contextmanager
    def get_file(self, id: str) -> Iterator[Path]:
        # Create a temp file.
        # 'delete=False' so we can close the handle and let validators open it again.
        # We manually unlink (delete) it in the finally block.
        tmp = tempfile.NamedTemporaryFile(delete=False)

        try:
            # Stream download to the temp file
            self.s3_client.download_fileobj(self.incoming_files_bucket, id, tmp)
            tmp.close()  # Close handle so other libs can open it

            yield Path(tmp.name)
        except Exception as e:
            raise IOError(f"Failed to fetch from S3: {str(e)}")
        finally:
            # CLEANUP: Crucial for memory/disk efficiency in a worker
            Path(tmp.name).unlink(missing_ok=True)

    def store_file(self, source_path: Path, dest_id: str) -> None:
        try:
            with open(source_path, "rb") as f:
                self.s3_client.upload_fileobj(f, self.public_files_bucket, dest_id)
        except Exception as e:
            raise IOError(f"Failed to upload to S3: {str(e)}")
