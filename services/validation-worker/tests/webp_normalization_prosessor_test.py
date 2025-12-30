from pathlib import Path

import pytest
from PIL import Image

from core import AssetContext
from processors.image_normalizer import WebPNormalizationProcessor

# --- Fixtures ---


@pytest.fixture
def context_factory(tmp_path):
    """Helper to create an AssetContext easily."""

    def _create(file_path: Path):
        return AssetContext(file_path=file_path, trace_id="test-trace")

    return _create


@pytest.fixture
def cmyk_image(tmp_path):
    """Creates a dummy CMYK image."""
    p = tmp_path / "print_ready.jpg"
    img = Image.new("CMYK", (100, 100), color=(0, 0, 0, 0))
    img.save(p)
    return p


@pytest.fixture
def rotated_image(tmp_path):
    """
    Creates an image with EXIF orientation tag (e.g., taken sideways).
    Tag 274 (0x0112) is Orientation. Value 6 = Rotate 90 CW.
    """
    p = tmp_path / "sideways.jpg"
    img = Image.new("RGB", (100, 50), color="red")  # Wide image

    # Create simple EXIF data for Orientation = 6
    exif = img.getexif()
    exif[0x0112] = 6

    img.save(p, exif=exif)
    return p


@pytest.fixture
def private_image(tmp_path):
    """Creates an image with sensitive EXIF data (Copyright/GPS placeholders)."""
    p = tmp_path / "private.jpg"
    img = Image.new("RGB", (50, 50), color="blue")

    exif = img.getexif()
    # Tag 33432 is Copyright
    exif[33432] = "My Secret Copyright"
    img.save(p, exif=exif)
    return p


# --- Tests ---


def test_process_happy_path(tmp_path, context_factory):
    # 1. Setup
    input_path = tmp_path / "test.png"
    Image.new("RGB", (50, 50), color="green").save(input_path)

    processor = WebPNormalizationProcessor(quality=80)
    context = context_factory(input_path)

    # 2. Execute
    result = processor.process(context)

    # 3. Assert
    assert result.success
    assert result.output_path
    assert result.output_path.exists()
    assert result.output_path.suffix == ".webp"
    # Verify we can actually open the result
    with Image.open(result.output_path) as out:
        assert out.format == "WEBP"
        assert out.mode == "RGB"


def test_process_converts_cmyk_to_rgb(cmyk_image, context_factory):
    processor = WebPNormalizationProcessor()
    context = context_factory(cmyk_image)

    result = processor.process(context)

    assert result.success
    assert result.output_path
    with Image.open(result.output_path) as out:
        # WebP doesn't support CMYK, so it must be RGB (or RGBA)
        assert out.mode == "RGB"
        # Ensure it didn't just crash or save as black
        assert out.getpixel((50, 50)) != (0, 0, 0)


def test_process_handles_exif_rotation(rotated_image, context_factory):
    """
    Input is 100x50 but has 'Rotate 90' tag.
    Output should be 50x100 (physically rotated).
    """
    processor = WebPNormalizationProcessor()
    context = context_factory(rotated_image)

    result = processor.process(context)

    assert result.success
    assert result.output_path
    with Image.open(result.output_path) as out:
        w, h = out.size
        # If exif_transpose worked, width/height should swap
        assert w == 50
        assert h == 100
        # Double check metadata is gone
        assert not out.getexif()


def test_process_strips_metadata(private_image, context_factory):
    processor = WebPNormalizationProcessor()
    context = context_factory(private_image)

    result = processor.process(context)

    assert result.success
    assert result.output_path
    with Image.open(result.output_path) as out:
        # getexif() returns an Image.Exif object, usually empty if stripped
        exif_data = out.getexif()
        # It should either be completely empty or not contain our custom tag
        assert not exif_data or 33432 not in exif_data


def test_process_fails_gracefully_on_corrupt_file(tmp_path, context_factory):
    # Create a text file masquerading as an image
    fake_img = tmp_path / "fake.jpg"
    fake_img.write_text("This is not an image")

    processor = WebPNormalizationProcessor()
    context = context_factory(fake_img)

    result = processor.process(context)

    # Should not raise exception, but return success=False
    assert not result.success
    assert result.output_path is None
    assert result.error_message
    assert "Failed to convert" in result.error_message


def test_process_handles_unicode_filenames(tmp_path, context_factory):
    # Setup: Create a file with Chinese characters and Emojis
    # Note: Some minimal Docker containers rely on strict ASCII unless configured.
    # This test ensures your environment handles UTF-8 paths correctly.
    unicode_name = "你好_🚀.jpg"
    input_path = tmp_path / unicode_name

    Image.new("RGB", (50, 50), color="red").save(input_path)

    processor = WebPNormalizationProcessor()
    context = context_factory(input_path)

    # Execute
    result = processor.process(context)

    # Assert
    assert result.success
    assert result.output_path
    assert result.output_path.exists()
    # Ensure the output filename preserved the characters (plus suffix)
    assert "你好_🚀_clean.webp" in result.output_path.name


def test_process_preserves_palette_transparency(tmp_path, context_factory):
    # Setup: Create a Paletted (P) PNG with transparency
    input_path = tmp_path / "logo.png"

    # Create RGBA first
    img_rgba = Image.new("RGBA", (100, 100), (255, 0, 0, 0))  # Fully Transparent Red
    # Draw a solid square in the middle
    for x in range(20, 80):
        for y in range(20, 80):
            img_rgba.putpixel((x, y), (255, 0, 0, 255))  # Solid Red

    # Convert to 'P' mode (Adaptive palette)
    img_p = img_rgba.quantize(colors=256, method=2)
    img_p.save(input_path)

    processor = WebPNormalizationProcessor()
    context = context_factory(input_path)

    # Execute
    result = processor.process(context)

    # Assert
    assert result.success
    assert result.output_path
    with Image.open(result.output_path) as out:
        assert out.mode == "RGBA"  # Runtime check

        # Get the pixel
        pixel_val = out.getpixel((0, 0))

        # TYPE GUARD: Tell Pylance this is definitely a tuple
        assert isinstance(pixel_val, tuple)

        r, g, b, a = pixel_val  # Error is gone now
        assert a == 0


def test_process_handles_animated_gif_flattening(tmp_path, context_factory):
    # Setup: Create a multi-frame GIF
    input_path = tmp_path / "spin.gif"

    frame1 = Image.new("RGB", (50, 50), color="red")
    frame2 = Image.new("RGB", (50, 50), color="blue")

    frame1.save(input_path, save_all=True, append_images=[frame2], duration=100, loop=0)

    processor = WebPNormalizationProcessor()
    context = context_factory(input_path)

    # Execute
    result = processor.process(context)

    # Assert
    assert result.success
    assert result.output_path
    with Image.open(result.output_path) as out:
        # Default behavior: It should be a single static frame (WebP)
        # If you wanted to support animation, you'd check out.n_frames > 1
        # But for now, we just ensure it didn't crash and produced a valid image.
        assert out.format == "WEBP"

        # Check that we got the first frame (Red)
        pixel = out.getpixel((25, 25))

        assert isinstance(pixel, tuple)

        # Handle potential RGBA vs RGB return types safely
        r, g, b = pixel[:3]

        # Allow for compression artifacts (Tolerance of +/- 5 is usually safe)
        assert r > 250, f"Red channel too low: {r}"  # Should be ~255
        assert g < 10, f"Green channel artifact too high: {g}"  # Should be ~0
        assert b < 10, f"Blue channel artifact too high: {b}"  # Should be ~0
