import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  RuntimeDiscoveryCoordinator,
  NativeDetector,
  ClaudeCodeDetector,
} from '@forge/runtime-engine';
import { ConnectionManager, SecretRedactor } from '@forge/auth-connections';
import {
  ProviderRegistry,
  ProviderRouter,
  RateLimiter,
  RoutingRequest,
} from '@forge/provider-router';
import { CapabilityResolver, SecurityPolicy } from '@forge/capability-resolver';
import { ToolExecutionEngine } from '@forge/tool-engine';
import { WorkspaceManager } from '@forge/workspace';

const execFileAsync = promisify(execFile);

describe('Canonical Subsystems End-to-End Integration (Docs 08–11)', () => {
  const secretKey = 'e2e-canonical-secret-signing-key';
  let tempDir: string;
  let repoPath: string;

  let workspaceManager: WorkspaceManager;
  let secretRedactor: SecretRedactor;
  let connectionManager: ConnectionManager;
  let providerRegistry: ProviderRegistry;
  let providerRouter: ProviderRouter;
  let capabilityResolver: CapabilityResolver;
  let toolEngine: ToolExecutionEngine;
  let discoveryCoordinator: RuntimeDiscoveryCoordinator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-canonical-e2e-'));
    repoPath = path.join(tempDir, 'project-repo');
    await fs.mkdir(repoPath, { recursive: true });

    // Initialize clean Git repository
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.name', 'Forge Canonical Tester'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.email', 'tester@forge.local'], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, 'README.md'), '# Canonical Test Repo\n', 'utf-8');
    await execFileAsync('git', ['add', 'README.md'], { cwd: repoPath });
    await execFileAsync('git', ['commit', '-m', 'chore: init'], { cwd: repoPath });

    workspaceManager = new WorkspaceManager(repoPath);

    // 1. Auth & Connections (Doc 10)
    secretRedactor = new SecretRedactor();
    secretRedactor.registerSecret('top-secret-anthropic-key-999');
    connectionManager = new ConnectionManager(secretRedactor);

    connectionManager.registerConnection({
      id: 'conn_anthropic_e2e',
      name: 'Anthropic Cloud Primary',
      type: 'PROVIDER',
      authType: 'API_KEY',
      status: 'CONFIGURED',
      credentialOwnership: 'FORGE_MANAGED',
      credentialRef: 'secret://connections/conn_anthropic_e2e/key',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    connectionManager.storeSecret(
      'secret://connections/conn_anthropic_e2e/key',
      'top-secret-anthropic-key-999'
    );
    await connectionManager.validateConnection('conn_anthropic_e2e');

    // 2. Runtime Discovery (Doc 08)
    discoveryCoordinator = new RuntimeDiscoveryCoordinator([
      new NativeDetector(),
      new ClaudeCodeDetector(async () => ({ stdout: 'claude 1.0.42', stderr: '' })),
    ]);

    // 3. Provider Router (Doc 09)
    providerRegistry = new ProviderRegistry();
    providerRegistry.registerProvider({
      id: 'anthropic',
      name: 'Anthropic AI',
      type: 'CLOUD',
      status: 'AVAILABLE',
      rateLimits: { rpm: 120, tpm: 200000 },
    });
    providerRegistry.registerModel({
      id: 'claude-3-5-sonnet',
      providerId: 'anthropic',
      name: 'Claude 3.5 Sonnet',
      family: 'claude',
      contextWindow: 200000,
      capabilities: ['code_generation', 'tool_calling', 'reasoning', 'structured_output'],
      costPerMillionTokens: { input: 3.0, output: 15.0 },
    });
    providerRouter = new ProviderRouter(providerRegistry, new RateLimiter());

    // 4. Capability Resolver (AD-004)
    const policy: SecurityPolicy = {
      projectId: 'proj_canonical',
      allowedTools: [
        'filesystem.write',
        'filesystem.read',
        'http.request',
        'system.privileged_exec',
      ],
      forbiddenTools: ['shell.exec'],
      minTrustLevel: 'L1',
      requireApprovalForTools: [],
    };
    capabilityResolver = new CapabilityResolver(secretKey, policy);

    // 5. Tool Execution Engine (Doc 11)
    toolEngine = new ToolExecutionEngine(capabilityResolver, secretRedactor);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('proves the canonical chain: Discovery -> Auth Connection -> Provider Routing -> Token -> Risk-Gated Tool Execution', async () => {
    // Step A: Runtime Discovery discovers available runtimes without executing
    const runtimes = await discoveryCoordinator.discoverAll();
    expect(runtimes.length).toBe(2);
    const nativeRuntime = runtimes.find((r) => r.id === 'native-forge');
    expect(nativeRuntime?.trustProfile.trustClass).toBe('L4');
    expect(nativeRuntime?.available).toBe(true);

    // Step B: Auth Connection confirms provider connection is healthy
    const conn = connectionManager.getConnection('conn_anthropic_e2e');
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.health?.isHealthy).toBe(true);

    // Step C: Provider Router selects model adhering to HardConstraints
    const routingReq: RoutingRequest = {
      taskId: 'task_canonical_001',
      agentId: 'agent.lead_architect',
      hardConstraints: {
        minContextWindow: 50000,
        requiresToolCalling: true,
        requiresStructuredOutput: true,
      },
      preferredProviderId: 'anthropic',
    };
    const decision = providerRouter.route(routingReq);
    expect(decision.providerId).toBe('anthropic');
    expect(decision.modelId).toBe('claude-3-5-sonnet');
    expect(decision.fallbackUsed).toBe(false);

    // Step D: Create Isolated Git Worktree for Task
    const worktreeInfo = await workspaceManager.createWorktree('canonical-001', 'main');
    expect(worktreeInfo.branchName).toBe('forge/task-canonical-001');
    const worktreePath = worktreeInfo.worktreePath;

    // Step E: Capability Resolver issues ExecutionToken bound to Worktree
    const resDecision = capabilityResolver.resolve({
      taskId: 'task_canonical_001',
      agentId: 'agent.lead_architect',
      runtimeId: 'native-forge',
      runtimeTrustLevel: 'L4',
      requestedTools: ['filesystem.write', 'filesystem.read', 'system.privileged_exec'],
      workspacePath: worktreePath,
    });
    expect(resDecision.allowed).toBe(true);
    const token = resDecision.token!;

    // Step F: Tool Execution Engine writes file safely confined to Worktree
    const writeRes = await toolEngine.execute(
      'filesystem.write',
      {
        path: 'src/solution.ts',
        content: 'export const status = "canonical-proof-verified";',
      },
      token
    );
    expect(writeRes.success).toBe(true);
    expect(writeRes.riskLevel).toBe('MEDIUM');

    // Step G: Workspace Jail prevents escaping to parent directory
    await expect(
      toolEngine.execute(
        'filesystem.write',
        {
          path: '../parent_escape.txt',
          content: 'malicious escape',
        },
        token
      )
    ).rejects.toThrow(/Path traversal detected/);

    // Step H: Tool Execution Engine halts CRITICAL risk operations without approval gate
    const unapprovedCrit = await toolEngine.execute('system.privileged_exec', {}, token);
    expect(unapprovedCrit.success).toBe(false);
    expect(unapprovedCrit.requiresApproval).toBe(true);
    expect(unapprovedCrit.approvalStatus).toBe('AWAITING_APPROVAL');
    expect(unapprovedCrit.riskLevel).toBe('CRITICAL');

    // Step I: Approved CRITICAL tool succeeds
    const approvedCrit = await toolEngine.execute(
      'system.privileged_exec',
      { __humanApproved: true },
      token
    );
    expect(approvedCrit.success).toBe(true);

    // Step J: Verify written file content and ensure secret redaction works
    const readRes = await toolEngine.execute('filesystem.read', { path: 'src/solution.ts' }, token);
    expect(readRes.success).toBe(true);
    expect(readRes.output).toContain('canonical-proof-verified');

    // Clean up worktree
    await workspaceManager.removeWorktree('canonical-001');
  });
});
