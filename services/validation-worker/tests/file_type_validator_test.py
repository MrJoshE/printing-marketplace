import logging
import os
import uuid
from unittest.mock import patch

import pytest

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | [%(trace_id)s] | %(name)s | %(message)s")

# --- FIXTURES FOR IMAGES ---


@pytest.fixture
def valid_jpg(tmp_path):
    p = tmp_path / "test.jpg"
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
    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    policy = ValidationPolicy()
    context = AssetContext(file_path=valid_jpg, file_type_hint="image", trace_id="test")
    validator = ImageFileTypeValidator()

    result = validator.validate(context, policy)
    assert result.is_valid


def test_file_type_validator_valid_image(valid_jpg):
    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=valid_jpg, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/jpeg", "image/png"]})

    validator = ImageFileTypeValidator()
    result = validator.validate(context, policy)

    assert result.is_valid
    assert result.metadata["mime"] == "image/jpeg"


def test_file_type_validator_corrupt_file(corrupt_file):
    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=corrupt_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/jpeg"]})

    validator = ImageFileTypeValidator()
    result = validator.validate(context, policy)

    assert not result.is_valid


def test_file_type_validator_empty_file(tmp_path):
    empty_file = tmp_path / "empty.jpg"
    empty_file.touch()

    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=empty_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/jpeg"]})
    validator = ImageFileTypeValidator()

    result = validator.validate(context, policy)
    assert not result.is_valid


def test_file_type_validator_valid_but_forbidden_type(tmp_path):
    from PIL import Image

    p = tmp_path / "valid.png"
    Image.new("RGB", (10, 10)).save(p, format="PNG")

    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=p, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/jpeg"]})
    validator = ImageFileTypeValidator()

    result = validator.validate(context, policy)
    assert not result.is_valid and result.error_message
    assert "Invalid MIME" in result.error_message


def test_file_type_validator_missing_file(tmp_path):
    missing_path = tmp_path / "ghost.jpg"

    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=missing_path, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/jpeg"]})
    validator = ImageFileTypeValidator()

    result = validator.validate(context, policy)
    assert not result.is_valid


def test_file_type_validator_truncated_header(tmp_path):
    tiny_file = tmp_path / "tiny.jpg"
    tiny_file.write_bytes(b"\xff")

    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=tiny_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/jpeg"]})
    validator = ImageFileTypeValidator()

    result = validator.validate(context, policy)
    assert not result.is_valid


def test_file_type_validator_extension_mismatch(tmp_path):
    p = tmp_path / "trickster.jpg"
    p.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=p, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/png"]})
    validator = ImageFileTypeValidator()

    result = validator.validate(context, policy)
    assert result.is_valid
    assert result.metadata["mime"] == "image/png"


@pytest.mark.skipif(os.name == "nt", reason="chmod not enforced cleanly on Windows")
def test_file_type_validator_permission_denied(tmp_path):
    locked_file = tmp_path / "locked.jpg"
    locked_file.write_bytes(b"data")
    locked_file.chmod(0o000)

    from core import AssetContext, ValidationPolicy
    from validators.image.image_file_type_validator import ImageFileTypeValidator

    context = AssetContext(file_path=locked_file, file_type_hint="image", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy(allowed_file_types={"image": ["image/jpeg"]})
    validator = ImageFileTypeValidator()

    try:
        with patch("os.access", return_value=False):
            result = validator.validate(context, policy)
        assert not result.is_valid
    finally:
        locked_file.chmod(0o666)
