from functools import lru_cache

from connections.local_storage_provider import LocalFileStorage

# Implementations
from connections.s3_storage_provider import S3Storage
from connections.tripo_connection_provider import TripoAPIGenerator
from core.config import ProductionSettings, settings
from domain.interfaces import FileStorage, MeshRepairer, ModelGenerator
from services.mesh_tools import TrimeshService
from services.model_generator import LocalModelGenerator


@lru_cache()
def get_storage() -> FileStorage:
    """
    Dependency Factory: Returns the correct storage backend based on ENV.
    Cached so we only initialize the connection once per worker process.
    """
    if isinstance(settings, ProductionSettings):
        return S3Storage(settings)

    return LocalFileStorage()


@lru_cache()
def get_repairer() -> MeshRepairer:
    """
    Dependency Factory: Returns the mesh repair service.
    """
    return TrimeshService()


@lru_cache()
def get_generator() -> ModelGenerator:
    """
    Dependency Factory: Returns the model generator service.
    """
    if isinstance(settings, ProductionSettings):
        return TripoAPIGenerator(settings)

    return LocalModelGenerator()
