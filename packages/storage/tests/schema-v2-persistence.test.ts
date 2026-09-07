import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ForgeDatabase,
  runMigrations,
  EventRepository,
  ApprovalRepository,
  ConnectionRepository,
} from '../src/index.js';

describe('Schema V2 Persistence & Repositories (13-EVENT & 16-DATABASE)', () => {
  let db: ForgeDatabase;

  beforeEach(() => {
    db = new ForgeDatabase(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('runs Schema V2 and initializes events, connections, approvals, and artifacts tables', () => {
    const raw = db.getRawDb();
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('events');
    expect(tables).toContain('connections');
    expect(tables).toContain('approvals');
    expect(tables).toContain('artifacts');
  });

  it('EventRepository appends domain events and queries by stream ID', () => {
    const repo = new EventRepository(db);

    repo.saveEvent({
      id: 'evt_001',
      eventType: 'TASK_STARTED',
      streamId: 'msn_alpha',
      streamType: 'MISSION',
      payload: { taskId: 'tsk_101', agentId: 'agent.coder' },
      timestamp: new Date().toISOString(),
    });

    repo.saveEvent({
      id: 'evt_002',
      eventType: 'TASK_COMPLETED',
      streamId: 'msn_alpha',
      streamType: 'MISSION',
      payload: { taskId: 'tsk_101', exitCode: 0 },
      timestamp: new Date().toISOString(),
    });

    const events = repo.getEvents('msn_alpha');
    expect(events.length).toBe(2);
    expect(events[0].eventType).toBe('TASK_STARTED');
    expect(events[1].eventType).toBe('TASK_COMPLETED');
    expect(events[0].payload.taskId).toBe('tsk_101');
  });

  it('ApprovalRepository manages board approvals room state machine', () => {
    const repo = new ApprovalRepository(db);

    // Create foreign key requirement: project -> mission -> task
    const raw = db.getRawDb();
    const now = new Date().toISOString();
    raw.prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('p1', 'P1', '.', ?, ?)").run(now, now);
    raw.prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('m1', 'p1', 'M1', 'ACTIVE', ?, ?)").run(now, now);
    raw.prepare("INSERT INTO tasks (id, mission_id, name, status, idempotency_key, input_payload, created_at, updated_at) VALUES ('t_crit', 'm1', 'Deploy Prod', 'PAUSED', 'idem_crit', '{}', ?, ?)").run(now, now);

    repo.create({
      id: 'appr_001',
      taskId: 't_crit',
      missionId: 'm1',
      toolName: 'system.privileged_exec',
      riskLevel: 'CRITICAL',
      reason: 'Production infrastructure mutation requested',
      status: 'PENDING',
      requestedByAgent: 'agent.admin',
      createdAt: now,
    });

    const pending = repo.findPending();
    expect(pending.length).toBe(1);
    expect(pending[0].toolName).toBe('system.privileged_exec');
    expect(pending[0].riskLevel).toBe('CRITICAL');

    // Approve the request
    repo.updateStatus('appr_001', 'APPROVED', 'Chairman of the Board');
    const updated = repo.findById('appr_001');
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.decidedBy).toBe('Chairman of the Board');
  });

  it('ConnectionRepository persists connection records with health metadata', () => {
    const repo = new ConnectionRepository(db);

    repo.save({
      id: 'conn_anthropic_prod',
      name: 'Anthropic Cloud',
      type: 'PROVIDER',
      authType: 'API_KEY',
      status: 'CONNECTED',
      credentialOwnership: 'USER_MANAGED',
      credentialRef: 'secret://env/ANTHROPIC_API_KEY',
      health: { isHealthy: true, checkedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const conn = repo.findById('conn_anthropic_prod');
    expect(conn).toBeDefined();
    expect(conn?.name).toBe('Anthropic Cloud');
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.health?.isHealthy).toBe(true);

    const all = repo.findAll();
    expect(all.length).toBe(1);
  });
});
