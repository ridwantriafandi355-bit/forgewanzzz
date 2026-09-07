import { DomainEvent } from "../types/events.js";

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    const set = this.handlers.get(eventType)!;
    const typedHandler = handler as EventHandler;
    set.add(typedHandler);

    return () => {
      set.delete(typedHandler);
    };
  }

  async emit<T = unknown>(event: DomainEvent<T>): Promise<void> {
    const set = this.handlers.get(event.type);
    if (!set || set.size === 0) return;

    const promises: Promise<void>[] = [];
    for (const handler of set) {
      try {
        const res = handler(event);
        if (res instanceof Promise) {
          promises.push(res);
        }
      } catch (err) {
        console.error(`Error in event handler for ${event.type}:`, err);
      }
    }
    await Promise.allSettled(promises);
  }
}
