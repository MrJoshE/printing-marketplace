import pytest
from PIL import Image

from core import AssetContext, ValidationErrorCode, ValidationPolicy
from validators.image.resolution_compliance_validator import ResolutionValidator


@pytest.fixture
def valid_image(tmp_path):
    p = tmp_path / "small.jpg"
    Image.new("RGB", (100, 100)).save(p)
    return p


@pytest.fixture
def massive_image(tmp_path):
    p = tmp_path / "huge.png"
    # Create a 5000x5000 image
    Image.new("RGB", (5000, 5000)).save(p)
    return p


@pytest.fixture
def corrupt_image(tmp_path):
    p = tmp_path / "bad.jpg"
    p.write_bytes(b"not_an_image")
    return p


def test_resolution_pass(valid_image):
    context = AssetContext(file_path=valid_image, trace_id="test-pass")
    # Policy allows up to 4K (4096)
    policy = ValidationPolicy(max_image_resolution=(4096, 4096))

    validator = ResolutionValidator()
    result = validator.validate(context, policy)

    assert result.is_valid
    assert result.metadata["width"] == 100
    assert result.metadata["height"] == 100


def test_resolution_fail_too_large(massive_image):
    context = AssetContext(file_path=massive_image, trace_id="test-fail")
    # Policy allows only 2K (2048)
    policy = ValidationPolicy(max_image_resolution=(2048, 2048))

    validator = ResolutionValidator()
    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_code == ValidationErrorCode.DIMENSION_TOO_LARGE
    assert result.error_message
    # Ensure metadata is present even on failure for debugging
    assert result.metadata["width"] == 5000


def test_resolution_corrupt_file(corrupt_image):
    context = AssetContext(file_path=corrupt_image, trace_id="test-corrupt")
    policy = ValidationPolicy()

    validator = ResolutionValidator()
    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_code == ValidationErrorCode.FILE_CORRUPT
