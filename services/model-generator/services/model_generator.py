import structlog
from domain.interfaces import ModelGenerator

logger = structlog.get_logger()


class LocalModelGenerator(ModelGenerator):
    async def generate_mesh(self, prompt: str) -> bytes:
        # Local implementation of model generation
        return b"local_model_url"
