from pathlib import Path
from unittest.mock import MagicMock

import pytest
import trimesh

from core import AssetContext
from processors.model_renderer import ModelRendererProcessor

# --- FIXTURES ---


@pytest.fixture
def local_file_path():
    """
    Finds the local file relative to THIS test file.
    """
    # Get directory of this test file
    benchmarks_dir = Path(__file__).parent.parent / "examples"

    # Point to your asset (Update filename here!)
    file_path = benchmarks_dir / "large_model.stl"

    # Safety check: fail fast if you forgot to put the file there
    if not file_path.exists():
        pytest.fail(f"Test asset not found at: {file_path}")

    return file_path


@pytest.fixture
def mock_context(local_file_path):
    """
    Creates an AssetContext using your REAL local file.
    """
    # Load the mesh (simulating the Loader step)
    try:
        mesh = trimesh.load(str(local_file_path), force="mesh")
    except Exception as e:
        pytest.fail(f"Could not load local test file: {e}")

    context = MagicMock(spec=AssetContext)
    context.file_path = local_file_path
    context.trace_id = "test_local_file_123"
    context.mesh = mesh
    return context


# --- TESTS ---


@pytest.mark.skipif(not Path("examples/large_model.stl").exists(), reason="Local test file not found")
def test_render_local_file(mock_context):
    """
    Uses your local .stl file to generate a render.
    """
    processor = ModelRendererProcessor()

    # Calculate real face count so we don't trigger the complexity gate
    real_face_count = len(mock_context.mesh.faces)
    meta = {"faces": real_face_count}

    print(f"\nProcessing local file: {mock_context.file_path.name}")
    print(f"Faces: {real_face_count}")

    # Run Process
    result = processor.process(mock_context, additional_info=meta)

    # Assertions
    assert result.success is True
    assert result.output_path is not None

    # Check if the output is actually an image
    assert result.output_path.__len__() > 0
    assert all(str(suffix).endswith(".webp") for suffix in result.output_path)

    print(f"✅ Render saved to: {result.output_path}")
