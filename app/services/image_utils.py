from __future__ import annotations

from io import BytesIO
from PIL import Image, UnidentifiedImageError

MAX_PIXELS = 40_000_000
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
FORMAT_TO_MIME = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
FORMAT_TO_EXT = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}


class InvalidImageError(ValueError):
    pass


def validate_and_normalize_image(image_bytes: bytes) -> tuple[bytes, str, str]:
    """Validate decoded image bytes and re-encode them without EXIF metadata."""
    if not image_bytes:
        raise InvalidImageError("Uploaded file is empty.")

    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(BytesIO(image_bytes)) as probe:
            fmt = (probe.format or "").upper()
            width, height = probe.size
            if fmt not in ALLOWED_FORMATS:
                raise InvalidImageError("Only PNG, JPEG, and WebP images are supported.")
            if width <= 0 or height <= 0 or width * height > MAX_PIXELS:
                raise InvalidImageError("Image dimensions are too large.")
            probe.verify()

        with Image.open(BytesIO(image_bytes)) as image:
            fmt = (image.format or "").upper()
            if getattr(image, "is_animated", False):
                image.seek(0)
            image.load()
            output = BytesIO()
            if fmt == "JPEG":
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")
                image.save(output, format="JPEG", quality=92, optimize=True)
            elif fmt == "WEBP":
                if image.mode not in ("RGB", "RGBA", "L"):
                    image = image.convert("RGBA")
                image.save(output, format="WEBP", quality=92, method=4)
            else:
                if image.mode not in ("RGB", "RGBA", "L", "LA"):
                    image = image.convert("RGBA")
                image.save(output, format="PNG", optimize=True)
            return output.getvalue(), FORMAT_TO_MIME[fmt], FORMAT_TO_EXT[fmt]
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        if isinstance(exc, InvalidImageError):
            raise
        raise InvalidImageError("Uploaded file is not a valid supported image.") from exc
