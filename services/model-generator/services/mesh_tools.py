import io
from typing import cast

import structlog
import trimesh
from domain.interfaces import MeshRepairer

logger = structlog.get_logger()


class TrimeshService(MeshRepairer):
    def repair_and_export_stl(self, raw_mesh: bytes, target_scale: float) -> bytes:
        logger.info("repairing_mesh", size_bytes=len(raw_mesh))

        # Load mesh (Trimesh detects format automatically)
        mesh = trimesh.load(io.BytesIO(raw_mesh), file_type="glb")

        # If scene, condense to single mesh
        if isinstance(mesh, trimesh.Scene):
            mesh = mesh.dump(concatenate=True)

        if not isinstance(mesh, trimesh.Trimesh):
            logger.error("invalid_mesh_type", type=type(mesh))
            raise ValueError("Invalid mesh data")

        # 1. Fill Holes
        if not mesh.metadata.get("is_watertight", False):
            logger.info("mesh_not_watertight_fixing")
            trimesh.repair.fill_holes(mesh)

        # 2. Fix Normals
        trimesh.repair.fix_normals(mesh)

        # 3. Scale (Normalize to unit cube, then scale to target mm)
        mesh.apply_translation(-mesh.centroid)
        max_dim = max(mesh.extents)
        if max_dim > 0:
            scale_factor = target_scale / max_dim
            mesh.apply_scale(scale_factor)

        # 4. Export to Binary STL
        # mesh.export() returns bytes when no filename is given
        result = mesh.export(file_type="stl", encoding="binary")

        # Dict: Returned if you export a Scene (multiple objects) to GLTF/GLB.
        # str: Returned if you export to an ASCII format (like OBJ or ASCII STL).
        # bytes: Returned if you export to a Binary format (like Binary STL or GLB).
        if not isinstance(result, bytes):
            logger.error("unexpected_export_type", type=type(result))
            raise ValueError("Export did not return bytes as expected")

        # So we cast to bytes here.
        return cast(bytes, result)
