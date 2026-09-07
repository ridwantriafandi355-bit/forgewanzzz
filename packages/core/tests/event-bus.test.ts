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

  it("invokes persistent sink on every emitted domain event (Doc 13 Ledger Sink)", async () => {
    const sink = vi.fn();
    const bus = new EventBus(sink);

    const eventA: DomainEvent = {
      id: "evt-sink-1",
      type: "task.created",
      timestamp: new Date().toISOString(),
      payload: { id: "t1" }
    };
    const eventB: DomainEvent = {
      id: "evt-sink-2",
      type: "board.approval.requested",
      timestamp: new Date().toISOString(),
      payload: { tool: "dangerous_op" }
    };

    await bus.emit(eventA);
    await bus.emit(eventB);

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenNthCalledWith(1, eventA);
    expect(sink).toHaveBeenNthCalledWith(2, eventB);
  });

  it("delivers events to wildcard subscribeAll listeners", async () => {
    const bus = new EventBus();
    const allHandler = vi.fn();

    bus.subscribeAll(allHandler);

    const event: DomainEvent = {
      id: "evt-wildcard",
      type: "agent.token.budget.exceeded",
      timestamp: new Date().toISOString(),
      payload: { agent: "coder-1" }
    };

    await bus.emit(event);

    expect(allHandler).toHaveBeenCalledTimes(1);
    expect(allHandler).toHaveBeenCalledWith(event);
  });

  it("remains resilient when persistent sink or handler throws", async () => {
    const errorSink = vi.fn().mockImplementation(() => {
      throw new Error("Disk full or database lockup");
    });
    const bus = new EventBus(errorSink);
    const goodHandler = vi.fn();

    bus.subscribe("task.done", goodHandler);

    const event: DomainEvent = {
      id: "evt-err",
      type: "task.done",
      timestamp: new Date().toISOString(),
      payload: { status: "OK" }
    };

    await expect(bus.emit(event)).resolves.not.toThrow();
    expect(goodHandler).toHaveBeenCalledWith(event);
  });
});

