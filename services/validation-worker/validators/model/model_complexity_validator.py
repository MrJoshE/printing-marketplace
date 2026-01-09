import logging

import numpy as np
import trimesh

from core import AssetContext, BaseValidator, ValidationErrorCode, ValidationPolicy, ValidationResult


class ModelComplexityValidator(BaseValidator):
    def __init__(self) -> None:
        super().__init__()
        self.name = self.__class__.__name__

    IS_CRITICAL = False

    def _validate_mesh(self, mesh: trimesh.Trimesh, policy: ValidationPolicy) -> tuple[ValidationErrorCode, str] | None:
        """Check that the model doesn't exceed complexity limits defined in the policy."""
        if not np.isfinite(len(mesh.vertices)).all() or not np.isfinite(len(mesh.faces)).all():
            return ValidationErrorCode.FILE_CORRUPT, "Model contains non-finite values."

        if len(mesh.vertices) == 0 or len(mesh.faces) == 0:
            return ValidationErrorCode.FILE_CORRUPT, "Model contains no vertices or faces."

        if len(mesh.vertices) > policy.max_model_verticies:
            return ValidationErrorCode.MODEL_TOO_COMPLEX, f"Model contains too many vertices ({len(mesh.vertices)})."

        if len(mesh.faces) > policy.max_model_faces:
            return ValidationErrorCode.MODEL_TOO_COMPLEX, f"Model contains too many faces ({len(mesh.faces)})."

        return None

    def validate(self, context: AssetContext, policy: ValidationPolicy) -> ValidationResult:
        logger = logging.LoggerAdapter(logging.getLogger(__name__), {"trace_id": context.trace_id})
        logger.debug("Attempting to verify the model is not too complex.")

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

            # ✅ Success - check complexity
            logger.info(f"Mesh loaded successfully: {mesh}")

            # Check that the model doesn't have too many veritcies
            validation_result = self._validate_mesh(mesh, policy)
            if validation_result is not None:
                error_code, error_message = validation_result
                logger.info(f"Model complexity validation failed: {error_message}")
                return ValidationResult(
                    validator_name=self.name,
                    is_valid=False,
                    error_code=error_code,
                    error_message=error_message,
                )

            return ValidationResult(validator_name=self.name, is_valid=True)

        except Exception as e:
            logger.warning(f"Failed to load mesh: {str(e)}")
            return ValidationResult(
                validator_name=self.name,
                is_valid=False,
                error_code=ValidationErrorCode.FILE_CORRUPT,
                error_message=f"Failed to load mesh: {str(e)}",
            )
