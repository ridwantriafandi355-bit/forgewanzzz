import { ExecutionToken, TrustLevel } from "@forge/core";
import { SecurityPolicy, ResolutionContext, ResolutionDecision } from "../types/policy.js";
import { createHmac, randomUUID } from "node:crypto";

const TRUST_LEVEL_RANK: Record<TrustLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4
};

export class CapabilityResolver {
  constructor(
    private secretSigningKey: string,
    private policy: SecurityPolicy
  ) {}

  resolve(ctx: ResolutionContext, validitySeconds: number = 300): ResolutionDecision {
    // 1. Validate Runtime Trust Level Floor
    const runtimeRank = TRUST_LEVEL_RANK[ctx.runtimeTrustLevel];
    const minRank = TRUST_LEVEL_RANK[this.policy.minTrustLevel];

    if (runtimeRank < minRank) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Trust level '${ctx.runtimeTrustLevel}' does not meet required policy minimum '${this.policy.minTrustLevel}'`
      };
    }

    // 2. Validate forbidden tools
    for (const tool of ctx.requestedTools) {
      if (this.policy.forbiddenTools.includes(tool)) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Tool '${tool}' is forbidden by project security policy`
        };
      }
    }

    // 3. Validate allowed tools (Least Privilege)
    for (const tool of ctx.requestedTools) {
      if (!this.policy.allowedTools.includes(tool)) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Tool '${tool}' is not in policy allowlist`
        };
      }
    }

    // 4. Check if human approval is required
    const requiresApproval = ctx.requestedTools.some(tool =>
      this.policy.requireApprovalForTools.includes(tool)
    );

    // 5. Mint ExecutionToken
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validitySeconds * 1000).toISOString();
    const tokenId = `tok_${randomUUID()}`;

    const payloadToSign = `${tokenId}:${ctx.taskId}:${ctx.agentId}:${ctx.runtimeId}:${ctx.workspacePath}:${ctx.requestedTools.join(",")}:${expiresAt}`;
    const signature = createHmac("sha256", this.secretSigningKey).update(payloadToSign).digest("hex");

    const token: ExecutionToken = {
      tokenId,
      taskId: ctx.taskId,
      agentId: ctx.agentId,
      runtimeId: ctx.runtimeId,
      workspacePath: ctx.workspacePath,
      allowedTools: ctx.requestedTools,
      issuedAt: now.toISOString(),
      expiresAt,
      signature
    };

    return {
      allowed: true,
      requiresApproval,
      token
    };
  }

  verifyToken(token: ExecutionToken): boolean {
    const now = new Date().toISOString();
    if (token.expiresAt < now) return false;

    const payloadToSign = `${token.tokenId}:${token.taskId}:${token.agentId}:${token.runtimeId}:${token.workspacePath}:${token.allowedTools.join(",")}:${token.expiresAt}`;
    const expectedSignature = createHmac("sha256", this.secretSigningKey).update(payloadToSign).digest("hex");

    return token.signature === expectedSignature;
  }
}
