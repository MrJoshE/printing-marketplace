import logging

from PIL import Image, UnidentifiedImageError

from core import (
    AssetContext,
    BaseValidator,
    ValidationErrorCode,
    ValidationPolicy,
    ValidationResult,
)


class ImageIntegrityValidator(BaseValidator):
    """
    Verifies that the image file is not truncated or structurally corrupt.
    Uses Pillow's 'verify()' method to scan the file without decoding pixels.
    """

    # This reads the whole file (I/O heavy), so we run it in the parallel "Standard Phase",
    # not the "Critical Phase".
    is_critical = False

    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        # Setup contextual logger
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})

        try:
            # We open the file. Note: verify() checks the file integrity
            # but creates a side effect where the image object cannot be used afterwards.
            # That is why we use a context manager to close it immediately.
            with Image.open(context.file_path) as img:
                img.verify()

            logger.debug(f"Integrity check passed for {context.file_path.name}")
            return ValidationResult(validator_name=self.__class__.__name__, is_valid=True)

        except (UnidentifiedImageError, SyntaxError, OSError) as e:
            # SyntaxError/OSError is often raised by verify() if the file is truncated
            # or has missing end-of-file markers.
            logger.warning(f"Integrity check failed: {str(e)}")
            return ValidationResult(
                validator_name=self.__class__.__name__,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_CORRUPT,
                error_message="Image file is corrupt, truncated, or unreadable.",
            )

        except Exception as e:
            logger.exception("Unexpected error during integrity check")
            return ValidationResult(
                validator_name=self.__class__.__name__,
                is_valid=False,
                error_code=ValidationErrorCode.UNKNOWN_ERROR,
                error_message=f"Integrity check crashed: {str(e)}",
            )
