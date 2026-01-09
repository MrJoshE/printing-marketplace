import asyncio
import operator
from typing import Annotated, List, Optional, TypedDict

import structlog

# In a real app, you might inject the generator too,
# but usually, API clients are lightweight enough to instantiate or use globally.
# Import Interfaces only (for type hinting)
from domain.interfaces import FileStorage, MeshRepairer, ModelGenerator
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph

logger = structlog.get_logger()


# --- 1. The State (The "Memory" of the Job) ---
class AgentState(TypedDict):
    job_id: str
    prompt: str
    scale_mm: float

    # Artifacts (Optional because they are created step-by-step)
    raw_mesh_bytes: Optional[bytes]
    clean_stl_bytes: Optional[bytes]
    final_url: Optional[str]

    # Error tracking
    retry_count: Annotated[int, operator.add]
    errors: Annotated[List[str], operator.add]


# --- 2. The Nodes (The Work Steps) ---


async def generate_node(state: AgentState, config: RunnableConfig):
    """
    Step 1: Call AI Model.
    """
    job_id = state["job_id"]
    logger.info("step_generate_start", job_id=job_id)

    # Validate Input
    if not state.get("prompt"):
        return {"errors": ["Missing prompt"], "retry_count": 0}

    # Instantiate Generator (or retrieve from config if you want to support mocks)
    generator: ModelGenerator = config["configurable"]["generator_service"]  # type: ignore

    try:
        # 30s+ await operation
        mesh = await generator.generate_mesh(state["prompt"])

        if not mesh:
            raise ValueError("Generator returned empty bytes")

        return {"raw_mesh_bytes": mesh}

    except Exception as e:
        logger.error("generation_failed", job_id=job_id, error=str(e))
        # Increment retry count (operator.add handles the +1)
        return {"errors": [str(e)], "retry_count": 1}


async def repair_node(state: AgentState, config: RunnableConfig):
    """
    Step 2: CPU Heavy Geometry Repair.
    **CRITICAL:** Runs in a thread pool to avoid blocking the Async Event Loop.
    """
    job_id = state["job_id"]
    logger.info("step_repair_start", job_id=job_id)

    # 1. State Safety Check
    raw_mesh = state.get("raw_mesh_bytes")
    if not raw_mesh:
        return {"errors": ["No raw mesh data found for repair step"]}

    # 2. Retrieve Injected Service (Dependency Injection)
    # This allows us to inject MockRepairer in tests or TrimeshService in prod
    repairer: MeshRepairer = config["configurable"]["repairer_service"]  # type: ignore
    target_scale = state["scale_mm"]

    try:
        # 3. Offload Heavy CPU work to Executor
        # Trimesh operations are blocking; we must wrap them.
        loop = asyncio.get_running_loop()

        clean_stl = await loop.run_in_executor(
            None,  # Uses default ThreadPoolExecutor
            repairer.repair_and_export_stl,
            raw_mesh,
            target_scale,
        )

        if not clean_stl:
            raise ValueError("Repair resulted in empty geometry")

        return {"clean_stl_bytes": clean_stl}

    except Exception as e:
        logger.error("repair_failed", job_id=job_id, error=str(e))
        return {"errors": [f"Repair failed: {str(e)}"]}


async def upload_node(state: AgentState, config: RunnableConfig):
    """
    Step 3: Save to Storage (S3 or Local).
    """
    job_id = state["job_id"]
    logger.info("step_upload_start", job_id=job_id)

    # 1. State Safety Check
    stl_bytes = state.get("clean_stl_bytes")
    if not stl_bytes:
        return {"errors": ["No STL bytes found to upload"]}

    # 2. Retrieve Injected Service
    storage: FileStorage = config["configurable"]["storage_service"]  # type: ignore

    try:
        filename = f"models/{job_id}.stl"

        # 3. Upload
        url = await storage.upload(stl_bytes, filename)

        return {"final_url": url}

    except Exception as e:
        logger.error("upload_failed", job_id=job_id, error=str(e))
        return {"errors": [f"Upload failed: {str(e)}"]}


# --- 3. The Logic (Edges/Routing) ---


def should_retry(state: AgentState):
    """
    Decides if we should retry generation or fail.
    """
    # Success Path: If we have raw bytes, move to repair
    if state.get("raw_mesh_bytes"):
        return "repair"

    # Retry Logic: Only retry generation failures
    current_retries = state.get("retry_count", 0)
    if current_retries < 3:
        logger.warning("retrying_generation", count=current_retries)
        return "generate"

    # Failure Path
    return "failed"


# --- 4. The Graph Construction ---

workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("generate", generate_node)
workflow.add_node("repair", repair_node)
workflow.add_node("upload", upload_node)
workflow.add_node(
    "failed",
    lambda s: logger.error("job_permanently_failed", id=s["job_id"]),  # type: ignore
)

# Set Entry Point
workflow.set_entry_point("generate")

# Add Conditional Edges
workflow.add_conditional_edges(
    "generate",
    should_retry,
    {"repair": "repair", "generate": "generate", "failed": "failed"},
)

# Standard Edges
workflow.add_edge("repair", "upload")
workflow.add_edge("upload", END)
workflow.add_edge("failed", END)

# Compile
app_graph = workflow.compile()
