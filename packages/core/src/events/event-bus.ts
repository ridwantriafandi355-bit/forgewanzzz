import { DomainEvent } from "../types/events.js";

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private persistentSink?: (event: DomainEvent<any>) => Promise<void> | void;

  constructor(persistentSink?: (event: DomainEvent<any>) => Promise<void> | void) {
    this.persistentSink = persistentSink;
  }

  setPersistentSink(sink: (event: DomainEvent<any>) => Promise<void> | void): void {
    this.persistentSink = sink;
  }

  getPersistentSink(): ((event: DomainEvent<any>) => Promise<void> | void) | undefined {
    return this.persistentSink;
  }

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

  subscribeAll<T = unknown>(handler: EventHandler<T>): () => void {
    return this.subscribe("*", handler);
  }

  async emit<T = unknown>(event: DomainEvent<T>): Promise<void> {
    const promises: Promise<void>[] = [];

    // 1. Persistent sink (append-only SQLite ledger / audit sink)
    if (this.persistentSink) {
      try {
        const res = this.persistentSink(event);
        if (res instanceof Promise) {
          promises.push(res);
        }
      } catch (err) {
        console.error(`Error in EventBus persistent sink for ${event.type}:`, err);
      }
    }

    // 2. Specific event type handlers
    const specificHandlers = this.handlers.get(event.type);
    if (specificHandlers) {
      for (const handler of specificHandlers) {
        try {
          const res = handler(event);
          if (res instanceof Promise) {
            promises.push(res);
          }
        } catch (err) {
          console.error(`Error in event handler for ${event.type}:`, err);
        }
      }
    }

    // 3. Wildcard handlers
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          const res = handler(event);
          if (res instanceof Promise) {
            promises.push(res);
          }
        } catch (err) {
          console.error(`Error in wildcard event handler for ${event.type}:`, err);
        }
      }
    }

    await Promise.allSettled(promises);
  }
}

