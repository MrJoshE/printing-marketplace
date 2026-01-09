from contextlib import asynccontextmanager
from typing import Any, Dict

import structlog
import taskiq_fastapi

# Internal Imports
from core.config import settings
from core.exceptions import (
    GenerationError,
    JobNotFoundError,
    RepairError,
    StorageError,
)
from core.logging import configure_logging
from core.taskiq import broker
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# MCP Imports
from fastmcp import FastMCP
from services.agent_service import AgentService

# 1. Configure Logging
configure_logging(json_logs=(settings.ENV == "production"))
logger = structlog.get_logger()

# 2. MCP Server Setup
mcp = FastMCP(settings.APP_NAME)


@mcp.tool(name="create_3d_model")
async def create_3d_model_tool(prompt: str, size_mm: float = 100.0) -> str:
    """
    Generates a 3D printable STL model. Returns the Job ID.
    """
    logger.info("mcp_tool_called", tool="create_3d_model", prompt=prompt)
    service = AgentService()
    job_id = await service.submit_job(prompt, size_mm)
    return f"Job submitted. ID: {job_id}"


# 3. Lifespan (Startup/Shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup_initiated", env=settings.ENV)

    # Initialize global service
    app.state.agent_service = AgentService()

    yield

    logger.info("shutdown_initiated")


# 4. Create Main App
app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, version="1.0.0")

taskiq_fastapi.init(broker, app)  # Taskiq-FastAPI Integration


# 5. Exception Handlers (Unchanged - kept for brevity)
@app.exception_handler(JobNotFoundError)
async def job_not_found_handler(request: Request, exc: JobNotFoundError):
    return JSONResponse(status_code=404, content={"success": False, "error": str(exc)})


@app.exception_handler(GenerationError)
async def generation_error_handler(request: Request, exc: GenerationError):
    return JSONResponse(status_code=502, content={"success": False, "error": str(exc)})


@app.exception_handler(RepairError)
async def repair_error_handler(request: Request, exc: RepairError):
    return JSONResponse(status_code=422, content={"success": False, "error": str(exc)})


@app.exception_handler(StorageError)
async def storage_error_handler(request: Request, exc: StorageError):
    return JSONResponse(status_code=503, content={"success": False, "error": str(exc)})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred.",
        },
    )


# 6. Mount MCP
app.mount("/mcp", mcp.http_app())


# 7. REST Endpoints
@app.post("/api/v1/generate")
async def generate_endpoint(
    request: Request, prompt: str, size_mm: float = 100.0
) -> Dict[str, Any]:
    """
    Submit a job.
    """
    service: AgentService = request.app.state.agent_service
    polling_interval = settings.POLLING_INTERVAL
    job_id = await service.submit_job(prompt, size_mm)

    return {
        "success": True,
        "job_id": job_id,
        "status_url": f"/api/v1/jobs/{job_id}",
        "polling_interval": polling_interval,
    }


# --- NEW: Status Polling Endpoint ---
@app.get("/api/v1/jobs/{job_id}")
async def job_status_endpoint(request: Request, job_id: str) -> Dict[str, Any]:
    """
    Check if the STL is ready.
    """
    service: AgentService = request.app.state.agent_service
    status_data = await service.get_job_status(job_id)

    # If the service returns "unknown", we raise 404
    if status_data.get("status") == "unknown":
        raise JobNotFoundError(f"Job {job_id} not found")

    return status_data


# --- NEW: Health Check ---
@app.get("/health")
def health_check():
    return {"status": "ok", "env": settings.ENV}
