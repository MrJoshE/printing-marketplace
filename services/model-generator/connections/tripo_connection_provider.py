import httpx
import structlog
from core.config import ProductionSettings
from core.exceptions import GenerationError
from domain.interfaces import ModelGenerator

logger = structlog.get_logger()


class TripoAPIGenerator(ModelGenerator):
    def __init__(self, settings: ProductionSettings):
        self.api_key = settings.TRIPO_API_KEY
        self.base_url = "https://api.tripo3d.ai/v2/openapi"

    async def generate_mesh(self, prompt: str) -> bytes:
        """
        Orchestrates the Text-to-3D flow via external API.
        """
        async with httpx.AsyncClient(timeout=60.0) as client:
            headers = {"Authorization": f"Bearer {self.api_key}"}

            # 1. Start Task
            logger.info("submitting_generation_task", prompt=prompt)
            payload = {"type": "text_to_model", "prompt": prompt}

            resp = await client.post(
                f"{self.base_url}/task", json=payload, headers=headers
            )
            if resp.status_code != 200:
                raise GenerationError(f"Provider rejected task: {resp.text}")

            task_id = resp.json()["data"]["task_id"]

            # 2. Poll for Completion (Simplified loop)
            # In production, you might offload polling to the queue to avoid holding connection
            import asyncio

            for _ in range(30):  # Try for 60 seconds
                await asyncio.sleep(2)
                check = await client.get(
                    f"{self.base_url}/task/{task_id}", headers=headers
                )
                data = check.json()["data"]

                if data["status"] == "success":
                    # 3. Download Result
                    model_url = data["output"]["model"]  # usually .glb
                    logger.info("downloading_raw_mesh", url=model_url)

                    file_resp = await client.get(model_url)
                    return file_resp.content

                if data["status"] == "failed":
                    raise GenerationError(f"Generation failed: {data.get('reason')}")

            raise TimeoutError("Generation timed out")
