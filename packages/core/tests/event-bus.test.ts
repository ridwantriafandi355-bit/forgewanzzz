import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { DomainEvent } from "../src/types/events.js";

describe("EventBus", () => {
  it("subscribes to events and delivers them asynchronously", async () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe("task.created", handler);

    const event: DomainEvent<{ taskId: string }> = {
      id: "evt-1",
      type: "task.created",
      timestamp: new Date().toISOString(),
      payload: { taskId: "task-100" }
    };

    await bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);

    unsubscribe();
    await bus.emit(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("handles multiple subscribers for the same event type", async () => {
    const bus = new EventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    bus.subscribe("task.started", handlerA);
    bus.subscribe("task.started", handlerB);

    const event: DomainEvent = {
      id: "evt-2",
      type: "task.started",
      timestamp: new Date().toISOString(),
      payload: { executionId: "exec-1" }
    };

    await bus.emit(event);

    expect(handlerA).toHaveBeenCalledWith(event);
    expect(handlerB).toHaveBeenCalledWith(event);
  });
});
