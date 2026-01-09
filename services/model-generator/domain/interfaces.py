from abc import ABC, abstractmethod


class ModelGenerator(ABC):
    @abstractmethod
    async def generate_mesh(self, prompt: str) -> bytes:
        """Returns raw mesh data (e.g. GLB/OBJ bytes)"""
        pass


class MeshRepairer(ABC):
    @abstractmethod
    def repair_and_export_stl(self, raw_mesh: bytes, target_scale: float) -> bytes:
        """Makes watertight and returns STL bytes"""
        pass


class FileStorage(ABC):
    @abstractmethod
    async def upload(self, file_data: bytes, filename: str) -> str:
        """Uploads and returns public URL"""
        pass
