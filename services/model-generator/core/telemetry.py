from core.config import settings
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter


def setup_telemetry():
    resource = Resource.create({"service.name": settings.APP_NAME})
    trace.set_tracer_provider(TracerProvider(resource=resource))

    # In production, swap ConsoleSpanExporter for OTLPSpanExporter (to Jaeger/Grafana)
    trace.get_tracer_provider().add_span_processor(
        BatchSpanProcessor(ConsoleSpanExporter())
    )


tracer = trace.get_tracer(__name__)
