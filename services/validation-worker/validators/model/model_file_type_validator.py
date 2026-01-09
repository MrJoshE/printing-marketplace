import logging
import struct
from typing import Callable, List, Optional

from core import AssetContext, BaseValidator, ValidationErrorCode, ValidationPolicy, ValidationResult

DetectorFunction = Callable[[bytes, int], Optional[str]]


# --- DETECTOR STRATEGIES ---


def detect_stl(head_bytes: bytes, file_size: int) -> Optional[str]:
    """
    Detects Stereolithography (STL) files with high precision.
    """
    # 1. CHECK ASCII STL
    # Must start with "solid" usually followed by a name.
    # We check the first 5 bytes.
    if head_bytes.lstrip().startswith(b"solid"):
        # Extra safety: If we find null bytes in the header, it's likely a binary file
        # that confusingly starts with "solid" (which is valid in binary spec but rare).
        if b"\0" not in head_bytes[:80]:
            return "model/stl"

    # 2. CHECK BINARY STL
    # Binary STLs have an 80-byte header (ignored) + 4-byte int (triangle count).
    # File must be at least 84 bytes.
    if len(head_bytes) < 84:
        return None

    try:
        # Read the triangle count (Little Endian Unsigned Int) at offset 80
        num_triangles = struct.unpack("<I", head_bytes[80:84])[0]

        # THE MATHEMATICAL PROOF
        # A minimal valid binary STL size is: 80 header + 4 count + (50 bytes * num_triangles)
        min_expected_size = 84 + (num_triangles * 50)

        # Fix: Allow files LARGER than expected (e.g., SolidWorks Color STLs),
        # but reject files SMALLER (which implies missing triangles/corruption).
        if file_size >= min_expected_size:
            return "model/stl"

    except Exception:
        pass  # Struct unpack failed

    return None


# --- MAIN VALIDATOR ---


class ModelFileTypeValidator(BaseValidator):
    """
    Validator to check if the 3D model file type matches expected tested formats.
    """

    def __init__(self):
        super().__init__()
        self.name = self.__class__.__name__

        # EXTENSION POINT: Add new detectors here!
        self.detectors: List[DetectorFunction] = [
            detect_stl,  # Check STL
        ]
        self.valid_extensions = {".stl"}

    IS_CRITICAL = True

    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})

        # 1. Basic File Integrity Checks
        if not context.file_path.exists():
            return ValidationResult(
                self.name, False, ValidationErrorCode.FILE_CORRUPT, f"No such file: {context.file_path}"
            )

        if context.file_path.suffix.lower() not in self.valid_extensions:
            return ValidationResult(
                self.name,
                False,
                ValidationErrorCode.FILE_CORRUPT,
                f"Invalid file extension '{context.file_path.suffix}'. Expected: {self.valid_extensions}",
            )

        # 2. Read Header Bytes (Safe Read)
        try:
            file_size = context.file_path.stat().st_size
            with open(context.file_path, "rb") as f:
                # We need at least 84 bytes for Binary STL check
                head_bytes = f.read(2048)
        except Exception as e:
            return ValidationResult(self.name, False, ValidationErrorCode.UNKNOWN_ERROR, f"Read error: {str(e)}")

        # 3. RUN STRATEGIES
        detected_mime: Optional[str] = None

        for detector in self.detectors:
            # We pass file_size now to allow for the binary math check
            mime = detector(head_bytes, file_size)
            if mime:
                detected_mime = mime
                logger.debug(f"Detector '{detector.__name__}' identified format: {mime}")
                break

        # 4. Handle Detection Failure
        if not detected_mime:
            return ValidationResult(
                self.name,
                False,
                ValidationErrorCode.FILE_CORRUPT,
                "File type unsupported or header corrupt.",
            )

        # 5. POLICY COMPLIANCE CHECK
        allowed_types = policy.allowed_file_types.get("model", [])

        if detected_mime not in allowed_types:
            return ValidationResult(
                self.name,
                False,
                ValidationErrorCode.MIME_MISMATCH,
                f"Format '{detected_mime}' is valid but not allowed by policy.",
                metadata={"detected_mime": detected_mime},
            )

        return ValidationResult(self.name, True, metadata={"mime": detected_mime})
