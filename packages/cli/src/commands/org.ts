import { join } from "node:path";
import {
  ForgeDatabase,
  runMigrations,
  OrganizationRepository,
  type OrganizationRecord,
  type AgentMemberRecord,
} from "@forge/storage";

export interface OrgCommandOptions {
  subcommand?: "list" | "create" | "members";
  orgId?: string;
  name?: string;
  maxAgents?: number;
  projectId?: string;
  json?: boolean;
  dbPath?: string;
}

export interface OrgCommandResult {
  organizations?: OrganizationRecord[];
  members?: AgentMemberRecord[];
  created?: OrganizationRecord;
  success: boolean;
  message?: string;
}

export async function orgCommand(opts: OrgCommandOptions = {}): Promise<OrgCommandResult> {
  const dbPath = opts.dbPath || join(process.cwd(), ".forge", "forge.db");
  const db = new ForgeDatabase(dbPath);
  runMigrations(db);

  const repo = new OrganizationRepository(db);
  const subcommand = opts.subcommand || "list";

  try {
    if (subcommand === "create") {
      if (!opts.orgId) {
        throw new Error("Organization ID is required (e.g. forge org create <orgId>)");
      }
      const name = opts.name || opts.orgId;
      const maxAgents = opts.maxAgents ? Number(opts.maxAgents) : 5;

      const created = repo.create({
        id: opts.orgId,
        name,
        maxAgents,
        projectId: opts.projectId,
      });

      if (opts.json) {
        console.log(JSON.stringify({ success: true, organization: created }, null, 2));
      } else {
        console.log(`\n[SUCCESS] AI Organization Created: ${created.name}`);
        console.log(`ID         : ${created.id}`);
        console.log(`Max Agents : ${created.maxAgents}`);
        console.log(`Project    : ${created.projectId || "None"}\n`);
      }

      return {
        success: true,
        created,
        message: `Organization '${created.id}' created.`,
      };
    }

    if (subcommand === "members") {
      if (!opts.orgId) {
        throw new Error("Organization ID is required (e.g. forge org members <orgId>)");
      }

      const members = repo.findMembersByOrg(opts.orgId);

      if (opts.json) {
        console.log(JSON.stringify({ success: true, orgId: opts.orgId, members }, null, 2));
      } else {
        console.log(`\n================== ORG MEMBERS: ${opts.orgId} ==================`);
        console.log(`Active Members: ${members.filter((m) => m.status === "ACTIVE").length}`);
        console.log(`---------------------------------------------------------------`);
        if (members.length === 0) {
          console.log("  (No members provisioned yet)");
        } else {
          for (const m of members) {
            const roleStr = `[${m.role}]`.padEnd(14);
            const statusStr = `[${m.status}]`.padEnd(18);
            console.log(`${roleStr} ${statusStr} ID: ${m.id}`);
          }
        }
        console.log(`===============================================================\n`);
      }

      return {
        success: true,
        members,
      };
    }

    // Default: list
    const orgs = repo.findAll(opts.projectId);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, organizations: orgs }, null, 2));
    } else {
      console.log(`\n===================== REGISTERED AI ORGANIZATIONS =====================`);
      console.log(`Total Organizations: ${orgs.length}`);
      console.log(`-----------------------------------------------------------------------`);
      if (orgs.length === 0) {
        console.log("  (No organizations created yet)");
      } else {
        for (const o of orgs) {
          const activeCount = repo.countActiveMembers(o.id);
          const nameStr = o.name.padEnd(26);
          const idStr = `(${o.id})`.padEnd(20);
          console.log(`${nameStr} ${idStr} Headcount: ${activeCount}/${o.maxAgents} agents`);
        }
      }
      console.log(`=======================================================================\n`);
    }

    return {
      success: true,
      organizations: orgs,
    };
  } finally {
    db.close();
  }
}
