import crypto from "node:crypto";
import type { AuditChainRepository } from "@forge/storage";
import type {
  ExecutionToken,
  ExecutionTokenPayload,
  MintTokenOptions,
  TokenValidationResult,
} from "../types/security.js";

export interface TokenManagerConfig {
  secretKey?: string;
  auditRepo?: AuditChainRepository;
}

export class ExecutionTokenManager {
  private secretKey: string;
  private auditRepo?: AuditChainRepository;
  private invocations = new Map<string, number>();
  private localRevocations = new Set<string>();

  constructor(config?: TokenManagerConfig) {
    this.secretKey = config?.secretKey ?? "forge-default-master-secret-key-32b";
    this.auditRepo = config?.auditRepo;
  }

  private canonicalizePayload(payload: ExecutionTokenPayload): string {
    return JSON.stringify({
      tokenId: payload.tokenId,
      taskId: payload.taskId,
      missionId: payload.missionId ?? null,
      agentId: payload.agentId,
      runtimeId: payload.runtimeId ?? null,
      workspacePath: payload.workspacePath ?? null,
      allowedTools: [...payload.allowedTools].sort(),
      maxInvocations: payload.maxInvocations,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    });
  }

  private signPayload(payload: ExecutionTokenPayload): string {
    const canonical = this.canonicalizePayload(payload);
    return crypto
      .createHmac("sha256", this.secretKey)
      .update(canonical)
      .digest("hex");
  }

  mintToken(options: MintTokenOptions): ExecutionToken {
    const tokenId = options.tokenId ?? `tok_${crypto.randomUUID()}`;
    const issuedAt = new Date().toISOString();
    const ttlMs = options.ttlMs ?? 300000; // 5 minutes default
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const nonce = options.nonce ?? crypto.randomBytes(16).toString("hex");

    const payload: ExecutionTokenPayload = {
      tokenId,
      taskId: options.taskId,
      missionId: options.missionId,
      agentId: options.agentId,
      runtimeId: options.runtimeId,
      workspacePath: options.workspacePath,
      allowedTools: options.allowedTools,
      maxInvocations: options.maxInvocations ?? 1,
      nonce,
      issuedAt,
      expiresAt,
    };

    const signature = this.signPayload(payload);
    this.invocations.set(tokenId, 0);

    if (this.auditRepo) {
      this.auditRepo.appendBlock({
        id: `evt_mint_${tokenId}`,
        eventType: "TOKEN_MINTED",
        actorId: options.agentId,
        payload: {
          tokenId,
          taskId: options.taskId,
          allowedTools: options.allowedTools,
          maxInvocations: payload.maxInvocations,
          expiresAt,
        },
      });
    }

    return { payload, signature };
  }

  serializeToken(token: ExecutionToken): string {
    const payloadEncoded = Buffer.from(JSON.stringify(token.payload)).toString(
      "base64url"
    );
    return `forge_sec_v1.${payloadEncoded}.${token.signature}`;
  }

  deserializeToken(tokenStr: string): ExecutionToken {
    const parts = tokenStr.split(".");
    if (parts.length !== 3 || parts[0] !== "forge_sec_v1") {
      throw new Error("Invalid execution token format");
    }

    const payloadRaw = Buffer.from(parts[1], "base64url").toString("utf-8");
    const payload = JSON.parse(payloadRaw) as ExecutionTokenPayload;
    return {
      payload,
      signature: parts[2],
    };
  }

  validateToken(
    tokenInput: ExecutionToken | string,
    context: {
      toolId: string;
      taskId?: string;
      agentId?: string;
      workspacePath?: string;
    }
  ): TokenValidationResult {
    let token: ExecutionToken;
    try {
      token =
        typeof tokenInput === "string"
          ? this.deserializeToken(tokenInput)
          : tokenInput;
    } catch {
      return { valid: false, reason: "MALFORMED_TOKEN" };
    }

    const { payload, signature } = token;

    // 1. Timing-safe signature check
    const expectedSig = this.signPayload(payload);
    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(signature);

    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      return { valid: false, reason: "INVALID_SIGNATURE" };
    }

    // 2. Revocation check
    if (
      this.localRevocations.has(payload.tokenId) ||
      (this.auditRepo && this.auditRepo.isTokenRevoked(payload.tokenId))
    ) {
      return { valid: false, reason: "TOKEN_REVOKED" };
    }

    // 3. Expiration check
    if (new Date(payload.expiresAt).getTime() <= Date.now()) {
      return { valid: false, reason: "TOKEN_EXPIRED" };
    }

    // 4. Task scope check
    if (context.taskId && payload.taskId !== context.taskId) {
      return { valid: false, reason: "TASK_SCOPE_MISMATCH" };
    }

    // 5. Agent scope check
    if (context.agentId && payload.agentId !== context.agentId) {
      return { valid: false, reason: "AGENT_SCOPE_MISMATCH" };
    }

    // 6. Workspace path check
    if (
      context.workspacePath &&
      payload.workspacePath &&
      payload.workspacePath !== context.workspacePath
    ) {
      return { valid: false, reason: "WORKSPACE_SCOPE_MISMATCH" };
    }

    // 7. Allowed tools check
    const toolAllowed =
      payload.allowedTools.includes("*") ||
      payload.allowedTools.includes(context.toolId);

    if (!toolAllowed) {
      return { valid: false, reason: "TOOL_NOT_PERMITTED" };
    }

    // 8. Invocations / Quota check
    const currentCount = this.invocations.get(payload.tokenId) ?? 0;
    if (currentCount >= payload.maxInvocations) {
      return {
        valid: false,
        reason: "QUOTA_EXCEEDED",
        remainingInvocations: 0,
      };
    }

    return {
      valid: true,
      remainingInvocations: payload.maxInvocations - currentCount,
    };
  }

  recordInvocation(tokenId: string): number {
    const current = this.invocations.get(tokenId) ?? 0;
    const next = current + 1;
    this.invocations.set(tokenId, next);
    return next;
  }

  revokeToken(tokenId: string, reason: string): void {
    this.localRevocations.add(tokenId);
    if (this.auditRepo) {
      this.auditRepo.revokeToken(tokenId, reason);
    }
  }

  isRevoked(tokenId: string): boolean {
    return (
      this.localRevocations.has(tokenId) ||
      Boolean(this.auditRepo?.isTokenRevoked(tokenId))
    );
  }
}
