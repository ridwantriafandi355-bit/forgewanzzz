import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ForgeDatabase,
  runMigrations,
  MemoryRepository,
  type MemoryRecordInput,
} from '../src/index.js';

describe('Schema V3 & MemoryRepository (12-MEMORY-CONTEXT)', () => {
  let db: ForgeDatabase;
  let repo: MemoryRepository;

  beforeEach(() => {
    db = new ForgeDatabase(':memory:');
    runMigrations(db);
    repo = new MemoryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('runs Schema V3 and creates memory_records and memory_fts tables', () => {
    const raw = db.getRawDb();
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('memory_records');
    expect(tables).toContain('memory_fts');
  });

  it('stores and retrieves memory records by ID', () => {
    const input: MemoryRecordInput = {
      id: 'mem_001',
      scopeType: 'PROJECT',
      scopeId: 'proj_forge',
      category: 'LEARNING',
      title: 'Zod Validation Invariant',
      content: 'Always validate tool parameters using Zod schemas before subprocess dispatch.',
      tags: ['security', 'validation', 'tools'],
      metadata: { priority: 'HIGH', author: 'Agent.Reviewer' },
      tokenCount: 15,
    };

    const saved = repo.store(input);
    expect(saved.id).toBe('mem_001');
    expect(saved.scopeType).toBe('PROJECT');
    expect(saved.tags).toEqual(['security', 'validation', 'tools']);
    expect(saved.accessCount).toBe(0);

    const retrieved = repo.findById('mem_001');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('Zod Validation Invariant');
    expect(retrieved?.metadata?.priority).toBe('HIGH');
  });

  it('lists memory records filtered by scope', () => {
    repo.store({
      id: 'mem_p1',
      scopeType: 'PROJECT',
      scopeId: 'proj_alpha',
      category: 'CONTEXT',
      content: 'Alpha project context overview',
    });

    repo.store({
      id: 'mem_p2',
      scopeType: 'PROJECT',
      scopeId: 'proj_alpha',
      category: 'SNIPPET',
      content: 'Helper snippet for DB connection',
    });

    repo.store({
      id: 'mem_p3',
      scopeType: 'PROJECT',
      scopeId: 'proj_beta',
      category: 'CONTEXT',
      content: 'Beta project context overview',
    });

    const alphaRecords = repo.listByScope('PROJECT', 'proj_alpha');
    expect(alphaRecords.length).toBe(2);
    expect(alphaRecords.map((r) => r.id)).toContain('mem_p1');
    expect(alphaRecords.map((r) => r.id)).toContain('mem_p2');

    const betaRecords = repo.listByScope('PROJECT', 'proj_beta');
    expect(betaRecords.length).toBe(1);
    expect(betaRecords[0].id).toBe('mem_p3');
  });

  it('performs full-text search with FTS5 BM25 ranking', () => {
    repo.store({
      id: 'mem_fts_1',
      scopeType: 'PROJECT',
      scopeId: 'proj_fts',
      category: 'LEARNING',
      title: 'PostgreSQL Connection Pooling Strategy',
      content: 'To prevent database connection exhaustion, configure maximum pool size to 20 connections.',
      tags: ['database', 'postgres', 'pooling'],
    });

    repo.store({
      id: 'mem_fts_2',
      scopeType: 'PROJECT',
      scopeId: 'proj_fts',
      category: 'LEARNING',
      title: 'Frontend React State Machine',
      content: 'Use deterministic finite state machine transitions for wizard modal dialogs.',
      tags: ['frontend', 'react', 'state'],
    });

    repo.store({
      id: 'mem_fts_3',
      scopeType: 'PROJECT',
      scopeId: 'proj_fts',
      category: 'ERROR_SOLUTION',
      title: 'Fix SQLite Busy Timeout Errors',
      content: 'When multiple workers access SQLite simultaneously, increase busy_timeout to 5000ms and enable WAL mode.',
      tags: ['sqlite', 'database', 'wal'],
    });

    // Search for database related concepts
    const dbResults = repo.search({
      query: 'database',
      scopeType: 'PROJECT',
      scopeId: 'proj_fts',
    });

    expect(dbResults.length).toBe(2);
    expect(dbResults.map((r) => r.id)).toContain('mem_fts_1');
    expect(dbResults.map((r) => r.id)).toContain('mem_fts_3');

    // Search for WAL timeout
    const walResults = repo.search({
      query: 'busy timeout',
    });
    expect(walResults.length).toBe(1);
    expect(walResults[0].id).toBe('mem_fts_3');
  });

  it('increments access count and updates lastAccessedAt', () => {
    repo.store({
      id: 'mem_acc_1',
      scopeType: 'AGENT',
      scopeId: 'agent_evaluator',
      category: 'LEARNING',
      content: 'Evaluator heuristic rules',
    });

    const initial = repo.findById('mem_acc_1');
    expect(initial?.accessCount).toBe(0);
    expect(initial?.lastAccessedAt).toBeNull();

    repo.recordAccess('mem_acc_1');
    const updated = repo.findById('mem_acc_1');
    expect(updated?.accessCount).toBe(1);
    expect(updated?.lastAccessedAt).toBeDefined();
  });

  it('deletes records from both memory_records and memory_fts', () => {
    repo.store({
      id: 'mem_del_1',
      scopeType: 'GLOBAL',
      scopeId: 'system',
      category: 'SNIPPET',
      title: 'Temporary Snippet',
      content: 'Ephemeral test code snippet to be purged.',
    });

    expect(repo.findById('mem_del_1')).not.toBeNull();
    const searchBefore = repo.search({ query: 'Ephemeral' });
    expect(searchBefore.length).toBe(1);

    const deleted = repo.delete('mem_del_1');
    expect(deleted).toBe(true);

    expect(repo.findById('mem_del_1')).toBeNull();
    const searchAfter = repo.search({ query: 'Ephemeral' });
    expect(searchAfter.length).toBe(0);
  });

  it('prunes older memories when exceeding retainMax limit', () => {
    for (let i = 1; i <= 5; i++) {
      repo.store({
        id: `mem_prune_${i}`,
        scopeType: 'TASK',
        scopeId: 'task_xyz',
        category: 'CONTEXT',
        content: `Intermediate thought turn ${i}`,
        createdAt: new Date(Date.now() - (10 - i) * 1000).toISOString(),
      });
    }

    expect(repo.listByScope('TASK', 'task_xyz').length).toBe(5);

    // Retain only the latest 3 records
    const prunedCount = repo.prune('TASK', 'task_xyz', 3);
    expect(prunedCount).toBe(2);

    const remaining = repo.listByScope('TASK', 'task_xyz');
    expect(remaining.length).toBe(3);
    // Oldest ones (1 and 2) should have been pruned
    expect(remaining.map((r) => r.id)).toEqual(['mem_prune_3', 'mem_prune_4', 'mem_prune_5']);
  });
});
