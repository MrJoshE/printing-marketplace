import struct
import uuid
from pathlib import Path

import pytest

from core import AssetContext, ValidationPolicy
from validators.model.mesh_load_validator import MeshLoadValidator


# --- SETUP: HELPER TO CREATE REAL STL ---
@pytest.fixture
def real_stl_file(tmp_path):
    """
    Creates a mathematically valid Binary STL file (A single triangle).
    This ensures trimesh can actually load it without crashing.
    """
    file_path = tmp_path / "valid_triangle.stl"

    # Header (80 bytes)
    header = b"\x00" * 80
    # Triangle Count (4 bytes uint32) = 1
    count = struct.pack("<I", 1)

    # Triangle Data (50 bytes)
    # Normal (3 floats) + V1 (3 floats) + V2 (3 floats) + V3 (3 floats) + Attr (2 bytes)
    # All zeros is technically a valid degenerate triangle
    data = b"\x00" * 50

    file_path.write_bytes(header + count + data)
    return file_path


@pytest.fixture
def corrupt_stl_file(tmp_path):
    p = tmp_path / "corrupt.stl"
    p.write_text("This is just text, not a mesh.")
    return p


# --- TESTS ---


def test_mesh_load_validator_success(real_stl_file):
    """
    Test loading a legitimate binary STL file.
    """
    # 1. Setup Context
    # We must patch the AssetContext to actually use trimesh (integration style)
    # OR rely on the real class if it's imported correctly.
    # Assuming AssetContext logic is:
    # @property
    # def mesh(self): return trimesh.load(str(self.file_path), force='mesh')

    context = AssetContext(file_path=real_stl_file, file_type_hint="model", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy()
    validator = MeshLoadValidator()

    # 2. Run
    result = validator.validate(context, policy)

    # 3. Assert
    assert result.is_valid, f"Validation failed: {result.error_message}"
    assert result.metadata["faces"] >= 1
    assert "vertices" in result.metadata


def test_mesh_load_validator_failure(corrupt_stl_file):
    """
    Test handling of a file that exists but is garbage data.
    """
    context = AssetContext(file_path=corrupt_stl_file, file_type_hint="model", trace_id=uuid.uuid4().hex)
    policy = ValidationPolicy()
    validator = MeshLoadValidator()

    result = validator.validate(context, policy)

    assert not result.is_valid
    assert result.error_code and result.error_message  # Should be FILE_CORRUPT or similar


def test_mesh_load_validator_missing_file(tmp_path):
    """
    Test handling of a file path that doesn't exist.
    """
    missing_file = tmp_path / "ghost.stl"
    context = AssetContext(file_path=missing_file, file_type_hint="model", trace_id=uuid.uuid4().hex)
    validator = MeshLoadValidator()

    result = validator.validate(context, ValidationPolicy())

    # Trimesh raises an error if file missing, validator should catch it
    assert not result.is_valid
    assert result.error_code == "ERR_FILE_CORRUPT" and result.error_message


@pytest.mark.skipif(not Path("examples/large_model.stl").exists(), reason="Local test file not found")
def test_mesh_load_validator_local_file():
    local_path = Path("examples/large_model.stl").resolve()
    context = AssetContext(file_path=local_path, file_type_hint="model", trace_id="local-test")
    validator = MeshLoadValidator()

    result = validator.validate(context, ValidationPolicy())

    assert result.is_valid
    print(f"\nStats for local file: {result.metadata}")
