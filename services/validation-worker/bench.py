import argparse
import asyncio
import logging
import time
from pathlib import Path
from unittest.mock import AsyncMock

from core import IncomingMessage, ListingRepository, ProductionConfig
from providers import FileProvider, S3FileProvider
from repository.postgres_repository import PostgresListingRepository

# Import your actual classes
from worker import ValidationWorker

# --- MOCKS FOR ISOLATION ---


class NoOpRepository(ListingRepository):
    """Simulates a DB that is infinitely fast (0ms latency)."""

    async def complete_file_validation(
        self,
        file_id: str,
        listing_id: str,
        new_file_key: str | None,
        generated_image_paths: list[str] = [],
        file_warning: str | None = None,
        metadata: dict | None = None,
    ) -> bool:
        return True

    async def mark_file_invalid(self, file_id: str, error: str) -> None:
        pass


class PreloadProvider(FileProvider):
    """
    Simulates 'Instant' S3.
    It points to a local file that already exists, skipping the download step.
    """

    def __init__(self, local_file_path: Path):
        self.local_path = local_file_path

    def get_file(self, id: str):
        from contextlib import contextmanager

        @contextmanager
        def _wrapper():
            yield self.local_path

        return _wrapper()

    def store_image(self, source_path: Path, dest_id: str):
        pass

    def store_product_file(self, source_path: Path, dest_id: str) -> None:
        pass

    def get_public_url(self, file_key: str) -> str:
        return f"http://mock-s3/{file_key}"


# --- BENCHMARK ENGINE ---


class BenchMessage(IncomingMessage):
    def __init__(self, data):
        self.data = data

    async def ack(self):
        pass

    async def nak(self, delay=None):
        pass


async def run_phase(
    phase_name: str, mode: str, file_type: str, local_file: Path, s3_key: str, iterations: int, concurrency: int
):
    print("\n" + "=" * 60)
    print(f"🏎️  STARTING PHASE: {phase_name}")
    print(f"   Type:        {file_type.upper()}")
    print(f"   Mode:        {mode.upper()}")
    print(f"   Concurrency: {concurrency}")
    print(f"   Total Jobs:  {iterations}")
    print("=" * 60)

    # 1. SETUP CONFIG
    bus = AsyncMock()
    config = ProductionConfig()  # type: ignore
    config.validation_concurrency = concurrency
    pool = None
    # 2. SETUP PROVIDER (Based on Mode)
    if mode == "cpu":
        # In CPU mode, we preload the specific file for this phase (image vs model)
        if not local_file.exists():
            print(f"❌ Error: Local file not found: {local_file}")
            return
        provider = PreloadProvider(local_file)
        repo = NoOpRepository()

    elif mode == "storage":
        # In Storage mode, we use real S3 but fake DB
        provider = S3FileProvider(
            endpoint_url=config.s3.endpoint_url, access_key=config.s3.access_key, secret_key=config.s3.secret_key
        )
        repo = NoOpRepository()

    elif mode == "full":
        # Full integration
        import asyncpg

        provider = S3FileProvider(
            endpoint_url=config.s3.endpoint_url, access_key=config.s3.access_key, secret_key=config.s3.secret_key
        )
        pool = await asyncpg.create_pool(config.postgres.dsn)
        repo = PostgresListingRepository(pool)
    else:
        raise ValueError("Invalid mode")

    # 3. INITIALIZE WORKER
    # We re-initialize the worker for every phase to ensure a clean slate (empty queues, fresh memory)
    worker = ValidationWorker(provider, repo, bus, config=config)
    logging.getLogger().setLevel(logging.ERROR)

    # 4. EXECUTE
    print(f"🚀 Launching {iterations} tasks...")
    start_time = time.perf_counter()

    tasks = []
    for i in range(iterations):
        payload = {
            "trace_id": f"bench_{file_type}_{i}",
            "file_id": f"file_{i}",
            "listing_id": f"listing_{i}",
            "user_id": "bench_user",
            # If mode is CPU, the key doesn't matter (provider ignores it).
            # If mode is STORAGE, this key must exist in your Bucket.
            "file_key": s3_key,
            "file_type": file_type,
        }
        tasks.append(worker.handle_job(BenchMessage(payload)))

    # Wait for all tasks
    await asyncio.gather(*tasks)

    # 5. REPORTING
    end_time = time.perf_counter()
    duration = end_time - start_time
    throughput = iterations / duration
    avg_latency = duration / iterations

    print(f"\n🏁 {phase_name} Complete!")
    print(f"⏱️  Total Time:     {duration:.4f}s")
    print(f"🚀 Throughput:     {throughput:.2f} jobs/sec")
    print(f"⚡ Avg. Latency:   {avg_latency:.4f}s per job")
    print(f"⚡ Capacity:       {throughput * 60:.0f} jobs/min")

    # Cleanup DB pool if needed
    if mode == "full" and pool and "pool" in locals():
        await pool.close()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["cpu", "storage", "full"])

    # Args for Image Phase
    parser.add_argument("--image-local", help="Path to local image (cpu mode)", default="./examples/large_image_4k.jpg")
    parser.add_argument(
        "--image-s3", help="S3 Key for image (storage/full mode)", default="benchmarks/large_image_4k.jpg"
    )

    # Args for Model Phase
    parser.add_argument("--model-local", help="Path to local .stl/.obj (cpu mode)", default="./examples/model.stl")
    parser.add_argument("--model-s3", help="S3 Key for model (storage/full mode)", default="benchmarks/large_model.stl")

    parser.add_argument("--count", type=int, default=50, help="Jobs per phase")
    parser.add_argument("-c", "--concurrency", type=int, default=10)

    args = parser.parse_args()

    # --- PHASE 1: IMAGE PROCESSING ---
    await run_phase(
        phase_name="IMAGE BENCHMARK",
        mode=args.mode,
        file_type="image",
        local_file=Path(args.image_local),
        s3_key=args.image_s3,
        iterations=args.count,
        concurrency=args.concurrency,
    )

    # Small cooldown between phases to let sockets/files close
    await asyncio.sleep(1)

    # --- PHASE 2: MODEL PROCESSING ---
    await run_phase(
        phase_name="3D MODEL BENCHMARK",
        mode=args.mode,
        file_type="model",
        local_file=Path(args.model_local),
        s3_key=args.model_s3,
        iterations=args.count,
        concurrency=args.concurrency,
    )


if __name__ == "__main__":
    asyncio.run(main())
