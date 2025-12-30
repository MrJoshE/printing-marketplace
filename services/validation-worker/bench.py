import argparse
import asyncio
import logging
import time
from pathlib import Path
from unittest.mock import AsyncMock

from core import IncomingMessage, ListingRepository, ProductionConfig
from providers import FileProvider, S3FileProvider
from repository.postgres_repository import PostgresListingRepository  # Assuming you have this

# Import your actual classes
from worker import ValidationWorker

# --- MOCKS FOR ISOLATION ---


class NoOpRepository(ListingRepository):
    """Simulates a DB that is infinitely fast (0ms latency)."""

    async def complete_file_validation(self, file_id: str, listing_id: str, new_file_key: str | None) -> bool:
        return True

    async def mark_file_failed(self, file_id: str, error: str) -> None:
        pass


class PreloadProvider(FileProvider):
    """
    Simulates 'Instant' S3.
    It points to a local file that already exists, skipping the download step.
    It ignores uploads.
    """

    def __init__(self, local_file_path: Path):
        self.local_path = local_file_path

    def get_file(self, id: str):
        from contextlib import contextmanager

        @contextmanager
        def _wrapper():
            yield self.local_path

        return _wrapper()

    def store_file(self, source_path: Path, dest_id: str):
        pass


# --- BENCHMARK ENGINE ---


async def run_benchmark(mode: str, dataset_path: Path, iterations: int, concurrency: int):
    print("\n🏎️  Starting Benchmark")
    print(f"   Mode:        {mode.upper()}")
    print(f"   Total Jobs:  {iterations}")
    print(f"   Concurrency: {concurrency} (Controlled by Worker Semaphore)")

    # 1. ASSEMBLY LINE - Construct the worker based on mode
    bus = AsyncMock()  # We always mock the bus
    config = ProductionConfig()  # type: ignore

    # IMPORTANT: Inject the concurrency limit into the config
    # This ensures the worker initializes its internal Semaphore correctly.
    config.validation_concurrency = concurrency

    # LAYER 1: PURE CPU
    if mode == "cpu":
        provider = PreloadProvider(dataset_path)
        repo = NoOpRepository()

    # LAYER 2: STORAGE I/O
    elif mode == "storage":
        provider = S3FileProvider(
            endpoint_url=config.s3.endpoint_url, access_key=config.s3.access_key, secret_key=config.s3.secret_key
        )
        repo = NoOpRepository()

    # LAYER 3: FULL SYSTEM
    elif mode == "full":
        import asyncpg

        provider = S3FileProvider(
            endpoint_url=config.s3.endpoint_url, access_key=config.s3.access_key, secret_key=config.s3.secret_key
        )
        pool = await asyncpg.create_pool(config.postgres.dsn)
        repo = PostgresListingRepository(pool)
    else:
        raise ValueError("Invalid mode")

    # Initialize Worker (It will now create its own Semaphore(concurrency))
    worker = ValidationWorker(provider, repo, bus, config=config)

    logging.getLogger().setLevel(logging.ERROR)

    # 2. GENERATE JOBS
    class BenchMessage(IncomingMessage):
        def __init__(self, data):
            self.data = data

        async def ack(self):
            pass

        async def nak(self, delay=None):
            pass

    # 3. EXECUTE
    # We no longer limit tasks here. We throw ALL tasks at the worker at once.
    # The worker's internal Semaphore will handle the queuing.

    print(f"🚀 Launching {iterations} tasks...")
    start_time = time.perf_counter()

    tasks = []
    for i in range(iterations):
        payload = {
            "trace_id": f"bench_{i}",
            "file_id": f"file_{i}",
            "listing_id": f"listing_{i}",
            "user_id": "bench_user",
            "file_key": "benchmarks/large_image_4k.jpg",  # Ensure this key is correct for your test
            "file_type": "image",
        }
        # Fire and forget (into the list)
        tasks.append(worker.handle_job(BenchMessage(payload)))

    # Await completion
    await asyncio.gather(*tasks)

    end_time = time.perf_counter()
    duration = end_time - start_time
    throughput = iterations / duration
    avg_latency = duration / iterations

    print("\n" + "-" * 40)
    print("🏁 Benchmark Complete!")
    print("📁 Used File Provider: " + type(worker.provider).__name__)
    print("🏢 Used Repository:    " + type(worker.repository).__name__)
    print("-" * 40)
    print(f"⏱️  Total Time:     {duration:.4f}s")
    print(f"🚀 Throughput:     {throughput:.2f} jobs/sec")
    print(f"⚡ Avg. Latency:   {avg_latency:.4f}s per job")
    print(f"⚡ Capacity:       {throughput * 60:.0f} jobs/min")
    print("-" * 40)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["cpu", "storage", "full"])
    parser.add_argument("--file", help="Path to local image for CPU test", default="./test_assets/large.jpg")
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("-c", "--concurrency", type=int, default=10, help="Worker internal concurrency limit")
    args = parser.parse_args()

    asyncio.run(run_benchmark(args.mode, Path(args.file), args.count, args.concurrency))
