import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase } from "../src/database.js";
import { runMigrations } from "../src/migrations/migrator.js";

describe("ForgeDatabase & Migrator", () => {
  let db: ForgeDatabase;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it("enforces foreign keys and creates tables correctly", () => {
    const raw = db.getRawDb();
    const tables = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("missions");
    expect(tableNames).toContain("tasks");
    expect(tableNames).toContain("task_dependencies");
    expect(tableNames).toContain("execution_leases");
    expect(tableNames).toContain("audit_log");
  });

  it("enforces foreign key cascade constraints", () => {
    const raw = db.getRawDb();
    raw.prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('p1', 'P1', '/tmp', 'now', 'now')").run();
    raw.prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('m1', 'p1', 'M1', 'ACTIVE', 'now', 'now')").run();
    raw.prepare(`
      INSERT INTO tasks (id, mission_id, name, status, priority, idempotency_key, input_payload, created_at, updated_at)
      VALUES ('t1', 'm1', 'T1', 'QUEUED', 50, 'hash1', '{}', 'now', 'now')
    `).run();

    // Deleting project cascades to mission and tasks
    raw.prepare("DELETE FROM projects WHERE id = 'p1'").run();

    const tasksCount = raw.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number };
    expect(tasksCount.count).toBe(0);
  });
});
