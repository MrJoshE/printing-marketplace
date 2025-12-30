import json
import logging

from nats.aio.client import Client as NATS
from nats.aio.msg import Msg

from core import BaseEvent, EventBus, IncomingMessage, MessageHandler

logger = logging.getLogger(__name__)


class NatsIncomingMessage(IncomingMessage):
    def __init__(self, msg: Msg):
        self.msg = msg
        self.data = json.loads(msg.data.decode())

    async def ack(self) -> None:
        await self.msg.ack()

    async def nak(self, delay: float = 0) -> None:
        await self.msg.nak(delay=delay)


class NatsEventBus(EventBus):
    def __init__(self, nc: NATS):
        self.nc = nc

    async def publish(self, event: BaseEvent):
        """
        Publishes a strictly typed Pydantic event to NATS.
        """
        # 1. Get topic from the class definition (e.g., "validation.file.start")
        subject = event.topic

        # 2. Serialize to bytes
        payload = event.model_dump_json().encode()

        # 3. Publish
        await self.nc.publish(subject, payload)
        logger.debug(f"Published event {event.event_id} to {subject}")

    async def subscribe(self, topic: str, handler: MessageHandler, max_messages: int = 0, manual_ack: bool = False):
        """
        Subscribes to a topic with a Queue Group.
        - topic: The subject to listen to.
        - handler: A function that takes a dict and does work.
        """

        async def wrapper(msg: Msg):
            try:
                incoming_msg = NatsIncomingMessage(msg)
                await handler(incoming_msg)
                if not manual_ack:
                    await incoming_msg.ack()
            except Exception:
                logger.exception(f"Error handling message on {topic}")
                await msg.ack()  # Ack to avoid redelivery of bad messages

        # "validation_workers" is the Queue Group name.
        # This ensures that if you have 10 workers, only ONE gets the message.
        await self.nc.subscribe(topic, max_msgs=max_messages, queue="validation_workers", cb=wrapper)
        logger.info(f"Subscribed to {topic} (Queue: validation_workers)")
