import uuid
from pathlib import Path
from typing import Callable

import pytest

AssetLoader = Callable[[str], Path]


# 2. THE CREATOR FIXTURE
@pytest.fixture
def asset_loader() -> AssetLoader:
    """
    Returns a callable function that resolves filenames to absolute paths.
    """

    def _loader(filename: str) -> Path:
        # Logic to find the file relative to THIS test file
        # Adjust .parent.parent if your structure is different
        benchmarks_dir = Path(__file__).parent.parent / "examples"
        file_path = benchmarks_dir / filename

        # Fail fast if file is missing
        if not file_path.exists():
            pytest.fail(f"🚨 Test asset missing! Could not find: {file_path}")

        return file_path

    return _loader


@pytest.mark.parametrize(
    "filename",
    [
        "large_model.stl",
    ],
)
def test_3d_model_validation(filename: str, asset_loader: AssetLoader):
    """
    Tests identification of 3D model formats.
    """
    from core import AssetContext, ValidationPolicy
    from validators.model.model_file_type_validator import ModelFileTypeValidator

    # 1. Use the creator func to get the path
    path = asset_loader(filename)

    # 2. Setup Context
    context = AssetContext(file_path=path, file_type_hint="model", trace_id=uuid.uuid4().hex)

    # 3. Setup Policy (Ensure these match what your validator returns)
    policy = ValidationPolicy()

    # 4. Run Validator
    validator = ModelFileTypeValidator()
    result = validator.validate(context, policy)

    # 5. Debug Output on Failure
    if not result.is_valid:
        pytest.fail(
            f"❌ Validation Failed for {filename}\n   Error: {result.error_message}\n   Metadata: {result.metadata}"
        )

    # 6. Assertions
    assert result.is_valid
    detected_mime = result.metadata["mime"]
    assert detected_mime in policy.allowed_file_types["model"]
    print(f"✅ Success: {filename} detected as {detected_mime}")
