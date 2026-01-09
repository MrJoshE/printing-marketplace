import logging
import os

import puremagic

from core import AssetContext, BaseValidator, ValidationErrorCode, ValidationPolicy, ValidationResult


class ImageFileTypeValidator(BaseValidator):
    """
    Validator to check if the file type matches expected types.
    """

    def __init__(self):
        super().__init__()
        self.name = self.__class__.__name__

    IS_CRITICAL = True  # If file type is invalid, halt the pipeline and don't continue with heavy processing.

    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})

        if not context.file_path.exists():
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_CORRUPT,
                error_message=f"No such file: {context.file_path}",
            )

        if not os.access(context.file_path, os.R_OK):
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_CORRUPT,
                error_message="Permission denied: Cannot read file",
            )

        detected_mime: str | None = None

        # 1. ATTEMPT PUREMAGIC
        # We wrap this in a try block, but if it fails, we DO NOT return yet.
        try:
            with open(context.file_path, "rb") as f:
                head_bytes = f.read(2048)

            matches = puremagic.magic_string(head_bytes)
            if matches:
                detected_mime = matches[0].mime_type
                logger.debug(f"Puremagic detected: {[m.mime_type for m in matches]}")

        except puremagic.PureError:
            # Caught: Standard library failed. Just log and continue to fallback.
            logger.debug("Puremagic failed to identify file headers. Proceeding to fallback.")
            detected_mime = None
        except Exception as e:
            logger.exception("Unexpected system error reading file")
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_message=str(e),
                error_code=ValidationErrorCode.UNKNOWN_ERROR,
            )

        # 3. FINAL VERDICT
        if not detected_mime:
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_CORRUPT,
                error_message="Could not identify file type",
            )

        # 4. POLICY CHECK
        allowed_types = policy.allowed_file_types.get(context.file_type_hint, [])
        if detected_mime not in allowed_types:
            logger.info(f"Validation Failed: MIME {detected_mime} not in policy {allowed_types}")
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_message=f"Invalid MIME: {detected_mime}",
                error_code=ValidationErrorCode.MIME_MISMATCH,
                metadata={"mime": detected_mime},
            )

        logger.debug(f"Valid MIME type detected: {detected_mime}")
        return ValidationResult(validator_name=self.__class__.__name__, is_valid=True, metadata={"mime": detected_mime})
