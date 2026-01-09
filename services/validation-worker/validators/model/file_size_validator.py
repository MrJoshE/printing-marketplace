import logging
import os

from core import AssetContext, BaseValidator, ValidationErrorCode, ValidationPolicy, ValidationResult


class FileSizeValidator(BaseValidator):
    def __init__(self):
        self.name = self.__class__.__name__

    IS_CRITICAL = True

    """Validator to check if the file size is within acceptable limits for model files."""

    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})
        file_size_mb = os.path.getsize(context.file_path) / (1024 * 1024)

        if file_size_mb > policy.max_file_size_mb:
            logger.warning(
                f"File size {file_size_mb:.2f} MB exceeds the maximum allowed size of {policy.max_file_size_mb} MB."
            )
            return ValidationResult(
                validator_name=self.__class__.__name__,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_TOO_LARGE,
                error_message=f"File size {file_size_mb:.2f} MB exceeds the maximum allowed size of {policy.max_file_size_mb} MB.",
            )

        return ValidationResult(
            validator_name=self.__class__.__name__,
            is_valid=True,
            error_message="File size is within acceptable limits.",
        )
