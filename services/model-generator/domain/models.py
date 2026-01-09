from typing import Generic, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field

T = TypeVar("T")


# Standard Error Struct
class ErrorDetails(BaseModel):
    code: str
    message: str
    trace_id: Optional[str] = None


class APIResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetails] = None


# Domain Models
class GenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    negative_prompt: Optional[str] = "low quality, blurry"
    scale_mm: float = Field(default=100.0, gt=0, le=500)  # Print bed limit


class JobStatus(BaseModel):
    job_id: UUID
    status: str  # "queued", "processing", "completed", "failed"
    result_url: Optional[str] = None
