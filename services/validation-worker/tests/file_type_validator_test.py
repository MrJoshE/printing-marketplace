import logging
import os
import uuid
from unittest.mock import patch

import pytest

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | [%(trace_id)s] | %(name)s | %(message)s")


@pytest.fixture
def valid_jpg(tmp_path):
    p = tmp_path / "test.jpg"
    # Create a tiny valid red JPEG
    from PIL import Image

    img = Image.new("RGB", (60, 30), color="red")
    img.save(p)
    return p


@pytest.fixture
def corrupt_file(tmp_path):
    p = tmp_path / "bad.jpg"
    p.write_bytes(b"not an image just garbage bytes")
    return p


@pytest.fixture
def text_file(tmp_path):
    p = tmp_path / "test.txt"
    p.write_text("This is a plain text file.")
    return p


def test_default_policy_configuration(valid_jpg):
    """
    Ensures the default policy actually aligns with the validator's output format.
    """
    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    # 1. Init Policy with DEFAULTS (no arguments)
    policy = ValidationPolicy()
    context = AssetContext(file_path=valid_jpg, file_type_hint="image", trace_id="test")
    validator = FileTypeValidator()

    # 2. Run Validation
    result = validator.validate(context, policy)

    # 3. This would have FAILED with your old code
    assert result.is_valid, (
        f"Default policy failed! validator returned {result.metadata.get('mime')} but policy allowed {policy.allowed_image_file_types}"
    )


def test_file_type_validator_valid_image(valid_jpg):
    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=valid_jpg, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg", "image/png"])

    validator = FileTypeValidator()
    result = validator.validate(context, policy)

    assert result.is_valid
    assert result.metadata["mime"] == "image/jpeg"


def test_file_type_validator_corrupt_file(corrupt_file):
    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=corrupt_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg", "image/png"])

    validator = FileTypeValidator()
    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_message == "Could not identify file type"


def test_file_type_validator_unsupported_type(text_file):
    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    logging.getLogger().setLevel(logging.DEBUG)
    context = AssetContext(file_path=text_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg", "image/png"])

    validator = FileTypeValidator()
    result = validator.validate(context, policy)

    assert not result.is_valid


def test_file_type_validator_empty_file(tmp_path):
    logging.getLogger().setLevel(logging.DEBUG)

    # Setup
    empty_file = tmp_path / "empty.jpg"
    empty_file.touch()  # Creates a 0-byte file

    # Context & Validator
    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=empty_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg"])
    validator = FileTypeValidator()

    # Execute
    result = validator.validate(context, policy)

    # Assert
    assert not result.is_valid
    assert result.error_message


def test_file_type_validator_valid_but_forbidden_type(tmp_path):
    # Setup: Create a valid PNG
    from PIL import Image

    p = tmp_path / "valid.png"
    Image.new("RGB", (10, 10)).save(p, format="PNG")

    # Context: Policy ONLY allows JPEGs
    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=p, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg"])  # PNG is missing!
    validator = FileTypeValidator()

    # Execute
    result = validator.validate(context, policy)

    # Assert
    assert not result.is_valid
    assert result.error_message
    assert "Invalid MIME" in result.error_message


def test_file_type_validator_missing_file(tmp_path):
    # Setup: Path to nowhere
    missing_path = tmp_path / "ghost.jpg"

    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=missing_path, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg"])
    validator = FileTypeValidator()

    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_message
    # Ensure we get a clean error message, not a worker crash
    assert "No such file" in result.error_message or "Errno 2" in result.error_message


def test_file_type_validator_truncated_header(tmp_path):
    # Setup: File with 1 byte (not enough for magic number)
    tiny_file = tmp_path / "tiny.jpg"
    tiny_file.write_bytes(b"\xff")

    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=tiny_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg"])
    validator = FileTypeValidator()

    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_message


def test_file_type_validator_extension_mismatch(tmp_path):
    # Setup: Create a file named .jpg, but put PNG bytes inside
    p = tmp_path / "trickster.jpg"

    # We write the PNG magic signature explicitly
    # \x89PNG\r\n\x1a\n
    p.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=p, file_type_hint="image", trace_id=uuid.uuid4().hex)
    # Policy only allows PNG.
    # Even though file is named .jpg, it should PASS because content is PNG.
    policy = ValidationPolicy(allowed_image_file_types=["image/png"])
    validator = FileTypeValidator()

    result = validator.validate(context, policy)

    assert result.is_valid
    assert result.metadata["mime"] == "image/png"


@pytest.mark.skipif(os.name == "nt", reason="chmod not enforced cleanly on Windows")
def test_file_type_validator_permission_denied(tmp_path):
    # Setup
    locked_file = tmp_path / "locked.jpg"
    locked_file.write_bytes(b"data")
    locked_file.chmod(0o000)  # Remove read permissions

    from core import AssetContext, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator

    context = AssetContext(file_path=locked_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_image_file_types=["image/jpeg"])
    validator = FileTypeValidator()

    try:
        with patch("os.access", return_value=False):
            result = validator.validate(context, policy)
        assert not result.is_valid
        assert result.error_message
        assert "Permission denied" in result.error_message
    finally:
        # Cleanup: restore permissions so pytest can delete the temp folder
        locked_file.chmod(0o666)
