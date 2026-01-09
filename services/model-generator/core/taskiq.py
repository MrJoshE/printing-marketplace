import structlog
from core.config import ProductionSettings, settings
from taskiq import InMemoryBroker, TaskiqEvents, TaskiqState
from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend

logger = structlog.get_logger()


# Factory function to choose the correct broker
def get_broker():
    if isinstance(settings, ProductionSettings):
        # Production: Use Redis
        return ListQueueBroker(
            url=settings.REDIS_URL,
            result_backend=RedisAsyncResultBackend(redis_url=settings.REDIS_URL),
        )
    else:
        # Local: Use In-Memory (No Redis required)
        return InMemoryBroker()


broker = get_broker()


# Lifecycle Events (Same for both)
@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def startup(state: TaskiqState):
    logger.info("taskiq_worker_starting", env=settings.ENV)


@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def shutdown(state: TaskiqState):
    logger.info("taskiq_worker_stopping")
