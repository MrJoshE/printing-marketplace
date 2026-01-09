import boto3
import structlog
from botocore.exceptions import ClientError
from core.config import ProductionSettings
from domain.interfaces import FileStorage

logger = structlog.get_logger()


class S3Storage(FileStorage):
    def __init__(self, settings: ProductionSettings):
        # Initialize boto3 client with env vars
        self.s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY,
            aws_secret_access_key=settings.AWS_SECRET_KEY,
            region_name=settings.AWS_REGION,
        )
        self.region = settings.AWS_REGION
        self.bucket = settings.S3_BUCKET_NAME
        self.upload_url = settings.S3_UPLOAD_URL

    async def upload(self, file_data: bytes, filename: str) -> str:
        """
        Uploads bytes to S3 and returns a presigned URL or public URL.
        """
        try:
            logger.info("uploading_to_s3", bucket=self.bucket, filename=filename)

            # Use run_in_executor because boto3 is synchronous (blocking)
            # In a high-throughput async app, this prevents blocking the event loop
            import asyncio

            loop = asyncio.get_running_loop()

            await loop.run_in_executor(
                None,
                lambda: self.s3_client.put_object(
                    Bucket=self.bucket,
                    Key=filename,
                    Body=file_data,
                    ContentType="model/stl",
                ),
            )

            url = f"{self.upload_url}/{filename}"
            return url

        except ClientError as e:
            logger.error("s3_upload_failed", error=str(e))
            raise e


class LocalStorage(FileStorage):
    async def upload(self, file_data: bytes, filename: str) -> str:
        """
        Mocks upload by saving to local disk and returning a file URL.
        """
        with open(f"/tmp/{filename}", "wb") as f:
            f.write(file_data)
        return f"file:///tmp/{filename}"
