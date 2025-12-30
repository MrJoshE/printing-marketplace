from typing import Dict, List

from core import BaseEvent, EventBus, IncomingMessage, MessageHandler


class InMemoryEventBus(EventBus):
    def __init__(self):
        self.published_messages: List[tuple] = []
        self.subscriptions: Dict[str, MessageHandler] = {}

    async def publish(self, event: BaseEvent):
        self.published_messages.append((event.topic, event))

    async def subscribe(self, topic: str, handler: MessageHandler, max_messages: int = 0, manual_ack: bool = False):
        self.subscriptions[topic] = handler

    # Helper for tests to simulate incoming NATS message
    async def simulate_message(self, topic: str, payload: IncomingMessage):
        if topic in self.subscriptions:
            await self.subscriptions[topic](payload)
