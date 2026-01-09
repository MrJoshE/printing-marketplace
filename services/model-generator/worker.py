import structlog
from agent.graph import AgentState, app_graph
from core.dependencies import get_generator, get_repairer, get_storage
from core.taskiq import broker
from domain.interfaces import FileStorage, MeshRepairer, ModelGenerator
from taskiq import TaskiqDepends

# Dependencies
# In a real app, these could be injected via Taskiq's dependency system,
# but direct imports work perfectly fine and are simpler to read.

logger = structlog.get_logger()


@broker.task(task_name="generate_3d_model")
async def generate_and_process_task(
    prompt: str,
    scale_mm: float,
    job_id: str,
    storage: FileStorage = TaskiqDepends(get_storage),
    repairer: MeshRepairer = TaskiqDepends(get_repairer),
    generator: ModelGenerator = TaskiqDepends(get_generator),
) -> dict:
    """
    The core background task.
    This function is agnostic to whether it runs in Redis (Prod) or Memory (Local).
    """
    logger.info("worker_task_started", job_id=job_id)

    # 1. Initialize the State Object for our LangGraph workflow
    # We populate it with the arguments passed from the AgentService
    initial_state = AgentState(
        job_id=job_id,
        prompt=prompt,
        scale_mm=scale_mm,
        # Default empty values for the new run
        retry_count=0,
        errors=[],
        raw_mesh_bytes=None,
        clean_stl_bytes=None,
        final_url=None,
    )

    # DI container for configurable services
    config = {
        "configurable": {
            "storage_service": storage,
            "repairer_service": repairer,
            "generator_service": generator,
        }
    }

    try:
        # 2. Execute the LangGraph Workflow
        # .ainvoke() runs the graph until it hits the END node
        result = await app_graph.ainvoke(initial_state, config=config)  # type: ignore

        # 3. Handle Success/Failure based on the final state
        if result.get("final_url"):
            logger.info("worker_task_success", job_id=job_id, url=result["final_url"])
            return {"status": "success", "url": result["final_url"]}

        else:
            # If the graph finished but didn't produce a URL, something went wrong
            errors = result.get("errors", ["Unknown error"])
            logger.error("worker_task_logic_failure", job_id=job_id, errors=errors)
            raise Exception(f"Job completed without URL. Errors: {errors}")

    except Exception as e:
        # 4. Handle Unexpected Crashes
        logger.error("worker_task_crashed", job_id=job_id, error=str(e))
        # Re-raising allows Taskiq to handle retries (if configured) or mark as failed
        raise e
