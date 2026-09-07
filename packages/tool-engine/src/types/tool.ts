export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresApproval?: boolean;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  requiresApproval?: boolean;
  approvalStatus?: 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
  riskLevel?: ToolRiskLevel;
  executionTimeMs: number;
}
