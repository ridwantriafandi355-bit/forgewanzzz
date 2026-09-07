export type TrustLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export interface RuntimeDescriptor {
  id: string;
  name: string;
  trustLevel: TrustLevel;
  capabilities: {
    filesystemGovernance: "none" | "path_jail" | "virtual_mount";
    networkGovernance: "unrestricted" | "allowlist" | "isolated";
    toolInterception: boolean;
    supportsCancellation: boolean;
  };
}
