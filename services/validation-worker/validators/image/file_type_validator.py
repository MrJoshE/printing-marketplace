import logging
import os

import puremagic

from core import AssetContext, BaseValidator, ValidationErrorCode, ValidationPolicy, ValidationResult


class FileTypeValidator(BaseValidator):
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

        try:
            with open(context.file_path, "rb") as f:
                head_bytes = f.read(2048)

            matches = puremagic.magic_string(head_bytes)
            logger.debug(f"Detected file types: {[m.mime_type for m in matches]}")

            if not matches:
                logger.warning(f"Validation Failed: No magic bytes match for {context.file_path.name}")
                return ValidationResult(
                    validator_name=self.name,
                    is_valid=False,
                    error_message="Unknown file type",
                    error_code=ValidationErrorCode.FILE_CORRUPT,
                )

            detected_mime = matches[0].mime_type
            logger.debug(f"Detected MIME: {detected_mime}")

            if detected_mime not in policy.allowed_image_file_types:
                logger.info(f"Validation Failed: MIME {detected_mime} not in policy {policy.allowed_image_file_types}")
                return ValidationResult(
                    validator_name=self.name,
                    is_valid=False,
                    error_message=f"Invalid MIME: {detected_mime}",
                    error_code=ValidationErrorCode.MIME_MISMATCH,
                )

            logger.debug(f"Valid MIME type detected: {detected_mime}")
            return ValidationResult(
                validator_name=self.__class__.__name__, is_valid=True, metadata={"mime": detected_mime}
            )

        except puremagic.PureError:
            logger.error("Puremagic error reading file headers")
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_message="Could not identify file type",
                error_code=ValidationErrorCode.FILE_CORRUPT,
            )

        except Exception as e:
            logger.exception("Unexpected validator crash")
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_message=str(e),
                error_code=ValidationErrorCode.UNKNOWN_ERROR,
            )
