import tempfile
import unittest
from pathlib import Path

from app.services import image_processing_service
from app.services.image_processing_service import normalize_generated_image


@unittest.skipIf(image_processing_service.Image is None, "Pillow is not installed")
class ImageProcessingServiceTests(unittest.TestCase):
    def test_normalize_generated_image_preserves_requested_source_size(self):
        assert image_processing_service.Image is not None

        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "generated.png"
            image_processing_service.Image.new(
                "RGB", (1024, 1024), (240, 240, 240)
            ).save(source)

            normalized = normalize_generated_image(source, target_size=(751, 463))

            with image_processing_service.Image.open(normalized) as image:
                self.assertEqual(image.size, (751, 463))


if __name__ == "__main__":
    unittest.main()
