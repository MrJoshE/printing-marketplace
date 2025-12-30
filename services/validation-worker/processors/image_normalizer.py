import logging

from PIL import Image, ImageOps

from core import AssetContext, BaseProcessor, ProcessingResult


class WebPNormalizationProcessor(BaseProcessor):
    """
    Sanitizes the image by re-encoding it to WebP.
    - Strips all Metadata/EXIF (Privacy & Security).
    - Converts CMYK to RGB (Rendering Safety).
    - Standardizes file extension.
    """

    def __init__(self, quality: int = 85):
        self.quality = quality

    def process(self, context: AssetContext) -> ProcessingResult:
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})

        try:
            # We create a new filename: "image.jpg" -> "image_clean.webp"
            new_filename = context.file_path.stem + "_clean.webp"
            output_path = context.file_path.parent / new_filename

            with Image.open(context.file_path) as img:
                # 1. Handle Orientation (EXIF Rotation)
                img = ImageOps.exif_transpose(img)

                # 2. Color Space Normalization
                # CMYK is bad for web. P (Palette) can be weird.
                # We convert everything to RGBA (for transparency support) or RGB.
                if img.mode in ("CMYK", "LAB", "HSV"):
                    logger.debug(f"Converting {img.mode} to RGB")
                    img = img.convert("RGB")
                elif img.mode == "P":
                    # Convert palette images to RGBA to preserve transparency safely
                    img = img.convert("RGBA")

                # 3. Save as WebP
                # calling save() without 'exif=...' strips metadata by default.
                img.save(
                    output_path,
                    "WEBP",
                    quality=self.quality,
                    method=4,  # Compression speed/quality balance (0-6)
                )

            logger.info(f"Image sanitized and converted to: {output_path.name}")

            return ProcessingResult(
                processor_name=self.__class__.__name__,
                success=True,
                output_path=output_path,
                metadata={"original_format": img.format, "original_mode": img.mode, "new_format": "WEBP"},
            )

        except Exception as e:
            logger.exception("Normalization failed")
            return ProcessingResult(
                processor_name=self.__class__.__name__,
                success=False,
                error_message=f"Failed to convert to WebP: {str(e)}",
            )
