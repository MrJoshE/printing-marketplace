import logging

from core import AssetContext, BaseValidator, ValidationErrorCode, ValidationPolicy, ValidationResult


class MeshLoadValidator(BaseValidator):
    def __init__(self) -> None:
        super().__init__()
        self.name = self.__class__.__name__

    IS_CRITICAL = True

    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})
        logger.debug("Attempting to load 3D mesh for validation.")

        try:
            mesh = context.mesh

            if mesh is None or (hasattr(mesh, "is_empty") and mesh.is_empty):
                logger.warning("Mesh loaded but was empty or None.")
                return ValidationResult(
                    validator_name=self.name,
                    is_valid=False,
                    error_code=ValidationErrorCode.FILE_CORRUPT,
                    error_message="File parsing resulted in an empty mesh.",
                )

            # ✅ Success!
            meta = {
                "is_winding_consistent": mesh.is_winding_consistent if hasattr(mesh, "is_winding_consistent") else None,
                "euler_number": mesh.euler_number if hasattr(mesh, "euler_number") else None,
                "triangles": len(mesh.triangles) if hasattr(mesh, "triangles") else None,
                "vertices": len(mesh.vertices) if hasattr(mesh, "vertices") else None,
                "faces": len(mesh.faces) if hasattr(mesh, "faces") else None,
                "is_watertight": mesh.is_watertight if hasattr(mesh, "is_watertight") else None,
                "bounds": mesh.bounds.tolist(),
            }

            logger.info(f"Mesh loaded successfully: {meta}")

            return ValidationResult(validator_name=self.name, is_valid=True, metadata=meta)

        except Exception as e:
            logger.warning(f"Failed to load mesh: {str(e)}")
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_CORRUPT,
                error_message="Failed to load model mesh. Contact support with the reference ID.",
            )
