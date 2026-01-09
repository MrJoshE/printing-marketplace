from typing import Any
from uuid import uuid4

import structlog
from core.taskiq import broker
from taskiq import TaskiqResult

# Import the task definition directly
# (Ensure app/worker.py exists and exports this task)
from worker import generate_and_process_task

logger = structlog.get_logger()


class AgentService:
    """
    Unified Service for dispatching 3D generation jobs.
    Works seamlessly for both Local (Memory) and Production (Redis) modes
    because the 'broker' handles the infrastructure abstraction.
    """

    async def submit_job(self, prompt: str, scale_mm: float) -> str:
        """
        Dispatches the job to the configured Taskiq broker.
        """
        # 1. Generate a consistent Business ID for the job
        job_id = str(uuid4())

        # 2. Dispatch Task (.kiq stands for "Kick it queue")
        # We explicitly set task_id=job_id so we can track it easily later
        task = (
            await generate_and_process_task.kicker()
            .with_task_id(job_id)
            .kiq(prompt=prompt, scale_mm=scale_mm, job_id=job_id)
        )

        logger.info(
            "job_dispatched",
            job_id=job_id,
            task_id=task.task_id,
            provider=broker.__class__.__name__,  # Logs "InMemoryBroker" or "ListQueueBroker"
        )

        return job_id

    async def get_job_status(self, job_id: str) -> dict[str, Any]:
        """
        Checks the status of a job using the Taskiq Result Backend.
        """
        try:
            # Fetch result using the same broker instance
            result: TaskiqResult = await broker.result_backend.get_result(job_id)

            if not result:
                return {"status": "unknown"}

            if result.is_err:
                return {"status": "failed", "error": str(result.error)}

            if result.return_value:
                return {"status": "completed", "result": result.return_value}

            return {"status": "processing"}

        except Exception as e:
            logger.error("status_check_failed", job_id=job_id, error=str(e))
            return {"status": "error"}
