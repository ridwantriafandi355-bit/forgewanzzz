import { describe, it, expect } from "vitest";
import { RuntimeRouter } from "../src/services/runtime-router.js";
import { L4NativeAdapter } from "../src/adapters/l4-native-adapter.js";
import { L1ExternalAdapter } from "../src/adapters/l1-external-adapter.js";
import { ToolExecutionEngine } from "@forge/tool-engine";
import { CapabilityResolver, SecurityPolicy } from "@forge/capability-resolver";

describe("RuntimeEngine", () => {
  const secretKey = "test-secret";
  const policy: SecurityPolicy = {
    projectId: "p1",
    allowedTools: ["filesystem.write", "filesystem.read"],
    forbiddenTools: [],
    minTrustLevel: "L1",
    requireApprovalForTools: []
  };

  const resolver = new CapabilityResolver(secretKey, policy);
  const toolEngine = new ToolExecutionEngine(resolver);

  const nativeAdapter = new L4NativeAdapter(toolEngine);
  const externalAdapter = new L1ExternalAdapter();
  const router = new RuntimeRouter([nativeAdapter, externalAdapter]);

  it("routes L4 native execution request to L4NativeAdapter", async () => {
    const decision = resolver.resolve({
      taskId: "t1",
      agentId: "agent.coder",
      runtimeId: "native-forge-runner",
      runtimeTrustLevel: "L4",
      requestedTools: ["filesystem.write"],
      workspacePath: process.cwd()
    });

    const result = await router.dispatch({
      runtimeId: "native-forge-runner",
      toolName: "filesystem.write",
      args: { path: "sample.txt", content: "test" },
      token: decision.token!
    });

    expect(result.success).toBe(true);
  });

  it("routes L1 external command to L1ExternalAdapter with process tracking and clean exit", async () => {
    const result = await router.executeExternalCommand({
      command: 'node -e "console.log(\'hello from external subprocess\')"',
      cwd: process.cwd(),
      timeoutMs: 5000
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from external subprocess");
    expect(result.durationMs).toBeGreaterThan(0);
  });
});
