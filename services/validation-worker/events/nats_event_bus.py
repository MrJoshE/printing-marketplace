import json
import logging
from typing import Awaitable, Callable

from nats.aio.client import Client as NATS
from nats.aio.msg import Msg
from nats.js import JetStreamContext
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy, StorageType

from core import BaseEvent, DeadLetterEvent, EventBus, IncomingMessage, MessageHandler

logger = logging.getLogger(__name__)

FailureHandler = Callable[[IncomingMessage, Exception], Awaitable[None]]


class NatsIncomingMessage(IncomingMessage):
    def __init__(self, msg: Msg):
        self.msg = msg
        self.data = json.loads(msg.data.decode())

    async def ack(self) -> None:
        await self.msg.ack()

    async def nak(self, delay: float = 0) -> None:
        await self.msg.nak(delay=delay)


class NatsEventBus(EventBus):
    def __init__(
        self,
        nc: NATS,
        jetstream: JetStreamContext,
        durable_name: str,
        queue_group: str,
        max_internal_failure_retries: int = 5,  # of retries before DLQ
        dead_letter_topic: str = "dlq.validate",
    ):
        self.nc = nc
        self.jetstream = jetstream
        self.durable_name = durable_name  # e.g. "validation-worker-1"
        self.queue_group = queue_group  # e.g. "validation_workers"
        self.max_internal_failure_retries = max_internal_failure_retries
        self.dead_letter_topic = dead_letter_topic

    async def publish(self, event: BaseEvent):
        """
        Publishes to the Stream.
        We use self.jetstream.publish (not self.nc) to ensure persistence.
        """
        subject = event.topic
        payload = event.model_dump_json().encode()

        # Waits for Stream Acknowledgement (Data Safety)
        await self.jetstream.publish(subject, payload)
        logger.debug(f"Published event {event.event_id} to {subject}")

    async def handle_continuously_failing_message(
        self, msg: Msg, latest_error: Exception, on_failure: FailureHandler | None
    ):
        """
        Handles messages sent to the Dead Letter Queue.
        """
        logger.error(
            f"Message on {msg.subject} exceeded max delivery attempts ({self.max_internal_failure_retries}). "
            f"Sending to DLQ {self.dead_letter_topic}."
        )

        original_event: dict = {
            "original_data": str(msg.data),
        }
        try:
            original_event = json.loads(msg.data.decode())

            if on_failure:
                await on_failure(NatsIncomingMessage(msg), latest_error)
        except Exception as e:
            logger.error(f"Failed to decode original event for DLQ: {e}")
            original_event.update({"decode_error": str(e)})

        await self.publish(
            DeadLetterEvent(
                topic=msg.subject,
                original_event=original_event,
                reason="Exceeded max delivery attempts",
                latest_error=str(latest_error),
            )
        )
        await msg.ack()  # Ack to remove from original stream
        return

    async def subscribe(
        self,
        topic: str,
        handler: MessageHandler,
        max_messages: int = 0,
        manual_ack: bool = False,
        on_failure: FailureHandler | None = None,
    ):
        """
        Explicit Push Consumer Setup.
        1. Configure the Consumer on the Server (Idempotent).
        2. Subscribe to the 'deliver_subject' using Core NATS.
        """

        async def wrapper(msg: Msg):
            try:
                incoming_msg = NatsIncomingMessage(msg)
                await handler(incoming_msg)
                if not manual_ack:
                    await incoming_msg.ack()
            except Exception as latest_error:
                number_of_deliveries = msg.metadata.num_delivered if msg.metadata else 0
                if number_of_deliveries >= self.max_internal_failure_retries:
                    await self.handle_continuously_failing_message(msg, latest_error, on_failure)
                    return
                    # Move to Dead Letter Queue after max retries

                # CRITICAL: NAK the message so NATS redelivers it to another worker
                logger.exception(f"Error handling message on {topic}, delivery attempt {number_of_deliveries + 1}")
                await msg.nak(delay=2)

        # 1. Ensure Stream Exists
        await self.ensure_dlq_exists()

        # 2. Define the "Push" Target
        # NATS will push messages to this internal subject
        deliver_subject = f"delivery.{self.durable_name}"

        # 3. Create/Update Consumer Configuration
        # This tells NATS: "Filter 'topic', and load balance deliveries
        # to the group 'queue_group' via 'deliver_subject'"
        consumer_conf = ConsumerConfig(
            durable_name=self.durable_name,
            deliver_group=self.queue_group,  # Server-side Load Balancing
            deliver_subject=deliver_subject,  # Where to push
            filter_subject=topic,
            max_ack_pending=max_messages,
            ack_policy=AckPolicy.EXPLICIT,
            ack_wait=60,  # Retry if worker dies for 60s
            max_deliver=self.max_internal_failure_retries,  # Max retries before giving up
        )

        try:
            # Add/Update the consumer. This is the source of truth.
            await self.jetstream.add_consumer("VALIDATE", consumer_conf)
        except Exception as e:
            # If this fails, it's a real server error (permissions, limits), not a client lib check.
            logger.error(f"Failed to configure consumer: {e}")
            raise e

        # 4. Subscribe (Client Side)
        # We listen to the subject where NATS is pushing the data.
        # We use the SAME queue group name here to ensure the client library
        # doesn't duplicate messages if you run multiple threads.
        await self.nc.subscribe(
            deliver_subject,
            queue=self.queue_group,
            cb=wrapper,
        )

        logger.info(f"Subscribed to {topic} [Durable: {self.durable_name} | Queue: {self.queue_group}]")

    async def ensure_dlq_exists(self):
        """
        Ensures the Dead Letter Queue Stream exists.
        """
        try:
            await self.jetstream.add_stream(
                name="DLQ",
                subjects=["dlq.>"],  # Catches anything sent to dlq.anything
                storage=StorageType.FILE,  # Save to disk so they survive restarts
                retention=RetentionPolicy.LIMITS,  # Keep messages until they hit age/size limits
                max_age=14 * 24 * 60 * 60,  # Optional: Auto-delete after 14 days
            )
            logger.info("✅ JetStream 'DLQ' stream verified.")
        except Exception as e:
            logger.warning(f"⚠️  Stream 'DLQ' check: {e}")
