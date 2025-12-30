import logging

from PIL import Image, UnidentifiedImageError

from core import AssetContext, BaseValidator, ValidationErrorCode, ValidationPolicy, ValidationResult


class ResolutionValidator(BaseValidator):
    """
    Checks if the image dimensions are within the allowed policy limits.
    Uses lazy loading to avoid reading pixel data into memory.
    """

    is_critical = False

    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        # Setup contextual logger
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})

        try:
            with Image.open(context.file_path) as img:
                width, height = img.size

                # Context we want in the report regardless of pass/fail
                metadata = {"width": width, "height": height, "max_allowed": policy.max_image_resolution}

                max_w, max_h = policy.max_image_resolution

                # Check 1: Dimensions
                if width > max_w or height > max_h:
                    logger.info(f"Image too large: {width}x{height} > {max_w}x{max_h}")
                    return ValidationResult(
                        validator_name=self.__class__.__name__,
                        is_valid=False,
                        error_code=ValidationErrorCode.DIMENSION_TOO_LARGE,
                        error_message=f"Image resolution {width}x{height} exceeds limit of {max_w}x{max_h}",
                        metadata=metadata,
                    )

                # Check 2: Safety (Decompression Bomb)
                # Pillow has a built-in safety limit (MAX_IMAGE_PIXELS).

                logger.debug(f"Resolution validated: {width}x{height}")
                return ValidationResult(validator_name=self.__class__.__name__, is_valid=True, metadata=metadata)

        except UnidentifiedImageError:
            # This should have been caught by FileTypeValidator, but just in case
            return ValidationResult(
                validator_name=self.__class__.__name__,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_CORRUPT,
                error_message="Could not read image dimensions (file may be corrupt).",
            )
        except Image.DecompressionBombError:
            return ValidationResult(
                validator_name=self.__class__.__name__,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_TOO_LARGE,
                error_message="Image contains too many pixels (Decompression Bomb protection).",
            )
        except Exception as e:
            logger.exception("Unexpected error in resolution validation")
            return ValidationResult(
                validator_name=self.__class__.__name__,
                is_valid=False,
                error_code=ValidationErrorCode.UNKNOWN_ERROR,
                error_message=f"Resolution check crashed: {str(e)}",
            )
