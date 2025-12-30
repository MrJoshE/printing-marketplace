import pytest
from PIL import Image

from core import AssetContext, ValidationErrorCode, ValidationPolicy
from validators.image.integrity_validator import ImageIntegrityValidator


@pytest.fixture
def valid_jpg(tmp_path):
    p = tmp_path / "good.jpg"
    Image.new("RGB", (50, 50), color="blue").save(p)
    return p


@pytest.fixture
def truncated_jpg(tmp_path):
    """
    Creates a valid JPEG header but cuts off the data halfway.
    This passes MagicBytes checks but fails Integrity checks.
    """
    p = tmp_path / "truncated.jpg"

    # 1. Create a real image
    temp_p = tmp_path / "temp.jpg"
    Image.new("RGB", (100, 100), color="red").save(temp_p)

    # 2. Read bytes and slice off the last 50%
    data = temp_p.read_bytes()
    half_size = len(data) // 2
    p.write_bytes(data[:half_size])

    return p


def test_integrity_valid_file(valid_jpg):
    context = AssetContext(file_path=valid_jpg, trace_id="test-ok")
    policy = ValidationPolicy()

    validator = ImageIntegrityValidator()
    result = validator.validate(context, policy)

    assert result.is_valid


def test_integrity_truncated_file(truncated_jpg):
    context = AssetContext(file_path=truncated_jpg, trace_id="test-trunc")
    policy = ValidationPolicy()

    validator = ImageIntegrityValidator()
    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_code == ValidationErrorCode.FILE_CORRUPT
    assert result.error_message
    assert "corrupt" in result.error_message or "truncated" in result.error_message


def test_integrity_garbage_file(tmp_path):
    p = tmp_path / "garbage.png"
    p.write_bytes(b"This is just random text pretending to be an image")

    context = AssetContext(file_path=p, trace_id="test-garbage")
    policy = ValidationPolicy()

    validator = ImageIntegrityValidator()
    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_code == ValidationErrorCode.FILE_CORRUPT
