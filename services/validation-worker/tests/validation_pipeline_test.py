import logging

import pytest

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s | %(levelname)s | [%(trace_id)s] | %(name)s | %(message)s")


@pytest.fixture
def valid_jpg(tmp_path):
    p = tmp_path / "test.jpg"
    # Create a tiny valid red JPEG
    from PIL import Image

    img = Image.new("RGB", (60, 30), color="red")
    img.save(p)
    return p


def test_pipeline(valid_jpg):
    from core import AssetContext, ValidationPipeline, ValidationPolicy
    from validators.image.file_type_validator import FileTypeValidator
    from validators.image.integrity_validator import ImageIntegrityValidator
    from validators.image.resolution_compliance_validator import ResolutionValidator

    context = AssetContext(file_path=valid_jpg, file_type_hint="image", trace_id="test-pipeline")
    policy = ValidationPolicy()
    pipeline = ValidationPipeline(
        validators=[
            FileTypeValidator(),
            ResolutionValidator(),
            ImageIntegrityValidator(),
        ]
    )

    results = pipeline.run(context, policy)

    assert len(results) == 3
    assert all(r.is_valid for r in results)
