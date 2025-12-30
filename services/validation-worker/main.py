import asyncio
import logging
from typing import Any, Callable, TypeVar, cast

import asyncpg
from nats.aio.client import Client as NATS
from nats.errors import NoServersError

from core import EnvironmentConfig, EventBus, ListingRepository, LocalConfig, ProductionConfig
from events.in_memory_event_bus import InMemoryEventBus
from events.nats_event_bus import NatsEventBus
from repository.in_memory_repository import InMemoryRepository
from repository.postgres_repository import PostgresListingRepository
from worker import get_provider

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("Startup")

T = TypeVar("T")


async def wait_for_connection(name: str, connect_fn: Callable[[], Any]) -> Any:
    """
    Generic Retry Loop.
    Attempts to run 'connect_fn'. If it fails, waits 2s and tries again.
    """
    logger.info(f"⏳ [{name}] Connecting...")
    attempts = 0
    while True:
        try:
            # Try to connect
            result = await connect_fn()
            logger.info(f"✅ [{name}] Connected successfully.")
            return result
        except (OSError, asyncpg.PostgresError, NoServersError, ConnectionRefusedError) as e:
            attempts += 1
            logger.warning(f"⚠️  [{name}] Connection failed: {e}. Retrying in 2s... (Attempt {attempts})")
            await asyncio.sleep(2)
        except Exception as e:
            # If it's an unexpected error (e.g., ConfigError), crash hard so we see it.
            logger.exception(f"❌ [{name}] Fatal Error during connection.")
            raise e


async def main(config: EnvironmentConfig):
    event_bus: EventBus | None = None
    repository: ListingRepository | None = None
    file_provider = get_provider(config)

    # --- LOCAL / TEST MODE ---
    if isinstance(config, LocalConfig):
        logger.setLevel(logging.DEBUG)
        logger.info("🔧 Running in LOCAL mode with In-Memory mocks.")
        event_bus = InMemoryEventBus()
        repository = InMemoryRepository()

    # --- PRODUCTION MODE ---
    elif isinstance(config, ProductionConfig):
        config = cast("ProductionConfig", config)
        logger.setLevel(logging.INFO)

        # 1. CONNECT NATS (With Retry)
        async def connect_nats():
            nc = NATS()
            # We use max_reconnect_attempts=-1 so if it drops LATER, it reconnects forever.
            # But the 'await connect' here ensures the FIRST connection works.
            logger.info(f"[Startup]: 📊 Connecting to NATS at {config.nats.endpoint}.")
            await nc.connect(config.nats.endpoint, name="validation-worker", max_reconnect_attempts=-1)
            return nc

        nc = await wait_for_connection("NATS", connect_nats)

        event_bus = NatsEventBus(nc)

        # 2. CONNECT POSTGRES (With Retry)
        async def connect_db():
            return await asyncpg.create_pool(config.postgres.dsn)

        pool = await wait_for_connection("Postgres", connect_db)
        repository = PostgresListingRepository(pool)

    if event_bus and repository:
        from worker import ValidationWorker

        service = ValidationWorker(provider=file_provider, repository=repository, bus=event_bus, config=config)

        logger.info("🚀 Validation Worker fully initialized and running.")
        await service.start()

        # Keep the process alive
        stop_event = asyncio.Event()
        await stop_event.wait()
    else:
        logger.error("❌ Failed to initialize dependencies. Exiting.")
        exit(1)


if __name__ == "__main__":
    asyncio.run(main(ProductionConfig()))  # type: ignore
