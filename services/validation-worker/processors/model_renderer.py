import logging
from pathlib import Path

import numpy as np
import pyrender
from PIL import Image

from core import AssetContext, BaseProcessor, ProcessingResult


class ModelRendererProcessor(BaseProcessor):
    def __init__(self) -> None:
        super().__init__()
        self.name = self.__class__.__name__
        self.MAX_FACES = 500_000
        self.resolution = (1024, 768)

        # Define camera angles (Elevation, Azimuth in degrees)
        self.ANGLES = {
            "iso": {"elevation": 30, "azimuth": 45},
            "front": {"elevation": 0, "azimuth": 0},
            "side": {"elevation": 0, "azimuth": 90},
            "top": {"elevation": 90, "azimuth": 0},
        }

    def process(self, context: AssetContext, additional_info: dict = {}) -> ProcessingResult[list[Path]]:
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})

        try:
            mesh = context.mesh

            # COMPLEXITY GATE
            face_count = additional_info.get("faces") or len(mesh.faces)
            if face_count > self.MAX_FACES:
                return ProcessingResult(
                    processor_name=self.name, success=False, error_message=f"Mesh too complex ({face_count} faces)"
                )

            logger.info("Starting multi-angle render...")

            # Setup Scene ONCE
            scene, center, scale = self._setup_scene(mesh)

            generated_files: list[Path] = []

            # Render all angles
            error_messages = {}
            for name, angles in self.ANGLES.items():
                logger.debug(
                    f"Rendering view: {name} at Elevation {angles['elevation']}°, Azimuth {angles['azimuth']}°"
                )
                suffix = f"_{name}.webp"
                output_path = context.file_path.parent / (context.file_path.stem + suffix)

                error_message = self._render_view(
                    scene, center, scale, angles["elevation"], angles["azimuth"], output_path
                )

                if not error_message:
                    generated_files.append(output_path)
                    logger.info(f"Saved {name} view: {output_path.name}")
                else:
                    logger.warning(f"Failed to render {name} view: {error_message}")
                    error_messages[name] = f"{error_message}"

            if not generated_files:
                return ProcessingResult(
                    self.name, False, error_message=f"All renders failed; {str.join(',', error_messages)}"
                )

            # Return the ISO view as the "main" result
            # main_result = next((p for p in generated_files if "iso" in p.name), generated_files[0])
            file_warning: str | None = None
            if error_messages:
                file_warning = "Some views failed to render: " + "; ".join(
                    [f"{k}: {v}" for k, v in error_messages.items()]
                )
            return ProcessingResult(
                processor_name=self.name, success=True, output_path=generated_files, error_message=file_warning
            )

        except Exception as e:
            logger.exception("Model rendering failed")
            return ProcessingResult(self.name, success=False, error_message=str(e))

    def _setup_scene(self, trimesh_mesh):
        """Creates the scene geometry once to reuse for all angles."""
        # 1. Create Mesh with a default material if none exists
        mesh_pr = pyrender.Mesh.from_trimesh(trimesh_mesh, smooth=True)

        # --- CHANGE 1: White Background ---
        # bg_color is RGBA. [1,1,1,1] is solid white.
        scene = pyrender.Scene(bg_color=[1.0, 1.0, 1.0, 1.0], ambient_light=[0.3, 0.3, 0.3])
        scene.add(mesh_pr)

        # --- CHANGE 2: Better Lighting for White BG ---
        # A single directional light can look flat. Let's add a 3-point setup.

        # Key Light (brightest, from top-right)
        key_light = pyrender.DirectionalLight(color=[1.0, 1.0, 1.0], intensity=4.0)
        key_pose = self._look_at(np.array([10, 10, 10]), np.array([0, 0, 0]), np.array([0, 0, 1]))
        scene.add(key_light, pose=key_pose)

        # Fill Light (softer, from left to fill shadows)
        fill_light = pyrender.DirectionalLight(color=[1.0, 1.0, 1.0], intensity=2.0)
        fill_pose = self._look_at(np.array([-10, 5, 5]), np.array([0, 0, 0]), np.array([0, 0, 1]))
        scene.add(fill_light, pose=fill_pose)

        return scene, trimesh_mesh.centroid, trimesh_mesh.extents.max()

    def _render_view(self, scene, center, scale, elevation_deg, azimuth_deg, output_path) -> str | None:
        """Calculates camera position and renders a single frame."""
        cam_node = None
        r = None
        try:
            # 1. Calculate Camera Position on a Sphere
            theta = np.radians(azimuth_deg)
            phi = np.radians(elevation_deg)

            # Distance: 1.8x scale gives a good framing
            dist = scale * 1.8

            x = dist * np.cos(phi) * np.sin(theta)
            y = dist * np.cos(phi) * np.cos(theta)
            z = dist * np.sin(phi)

            camera_pos = np.array([x, y, z]) + center

            # 2. LookAt Matrix
            camera_pose = self._look_at(camera_pos, center, up=np.array([0, 0, 1]))

            # 3. Add Camera to Scene
            camera = pyrender.PerspectiveCamera(yfov=np.pi / 4.0, aspectRatio=self.resolution[0] / self.resolution[1])
            cam_node = scene.add(camera, pose=camera_pose)

            # 4. Render
            w, h = int(self.resolution[0]), int(self.resolution[1])
            r = pyrender.OffscreenRenderer(viewport_width=w, viewport_height=h)

            # FLAGS=0 for macOS stability
            color, _ = r.render(scene, flags=pyrender.RenderFlags.OFFSCREEN)

            # 5. Save
            if color is not None:
                # If the background is solid white, save as RGB to save space
                img = Image.fromarray(color, "RGB")
                img.save(output_path, "WEBP", quality=85, method=6)
                return None
            return "Failed to capture render output"

        except Exception as e:
            return f"Unable to render this model view due to an internal error. {e}"
        finally:
            # Clean up resources in finally block
            if r:
                r.delete()
            if cam_node:
                scene.remove_node(cam_node)

    def _look_at(self, eye, target, up):
        """Helper to create a LookAt matrix (standard OpenGL math)."""
        z_axis = eye - target
        z_axis = z_axis / np.linalg.norm(z_axis)

        x_axis = np.cross(up, z_axis)
        if np.linalg.norm(x_axis) < 1e-6:
            x_axis = np.array([1, 0, 0])
        else:
            x_axis = x_axis / np.linalg.norm(x_axis)

        y_axis = np.cross(z_axis, x_axis)
        y_axis = y_axis / np.linalg.norm(y_axis)

        mat = np.eye(4)
        mat[:3, 0] = x_axis
        mat[:3, 1] = y_axis
        mat[:3, 2] = z_axis
        mat[:3, 3] = eye
        return mat
