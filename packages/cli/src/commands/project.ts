import { join } from "node:path";
import {
  ForgeDatabase,
  runMigrations,
  ProjectRepository,
  type ProjectRecord,
  type ProjectConfigRecord,
} from "@forge/storage";

export interface ProjectCommandOptions {
  subcommand?: "list" | "config";
  projectId?: string;
  setKey?: string;
  setValue?: string;
  getKey?: string;
  json?: boolean;
  dbPath?: string;
}

export interface ProjectCommandResult {
  projects?: ProjectRecord[];
  config?: ProjectConfigRecord | null;
  value?: any;
  success: boolean;
  message?: string;
}

export async function projectCommand(
  opts: ProjectCommandOptions = {}
): Promise<ProjectCommandResult> {
  const dbPath = opts.dbPath || join(process.cwd(), ".forge", "forge.db");
  const db = new ForgeDatabase(dbPath);
  runMigrations(db);

  const repo = new ProjectRepository(db);
  const subcommand = opts.subcommand || "list";

  try {
    if (subcommand === "config") {
      const projectId = opts.projectId || "default";

      // If project doesn't exist, ensure record exists
      let proj = repo.findById(projectId);
      if (!proj) {
        proj = repo.create({
          id: projectId,
          name: projectId === "default" ? "Default Workspace Project" : projectId,
          rootPath: process.cwd(),
        });
      }

      let currentConfig = repo.getConfig(projectId);
      if (!currentConfig) {
        currentConfig = {
          projectId,
          budgetLimitUsd: 100.0,
          defaultOrgId: "default",
        };
        repo.saveConfig(currentConfig);
      }

      // Handle --set
      if (opts.setKey && opts.setValue !== undefined) {
        if (opts.setKey === "budget" || opts.setKey === "budgetLimitUsd") {
          currentConfig.budgetLimitUsd = parseFloat(opts.setValue);
        } else if (opts.setKey === "defaultOrg" || opts.setKey === "defaultOrgId") {
          currentConfig.defaultOrgId = opts.setValue;
        }

        repo.saveConfig(currentConfig);
        currentConfig = repo.getConfig(projectId);

        if (opts.json) {
          console.log(JSON.stringify({ success: true, updated: currentConfig }, null, 2));
        } else {
          console.log(`\n[SUCCESS] Project config updated: ${opts.setKey} = ${opts.setValue}\n`);
        }

        return {
          success: true,
          config: currentConfig,
          message: `Config updated for ${projectId}`,
        };
      }

      // Handle --get
      if (opts.getKey) {
        const val = (currentConfig as any)[opts.getKey];
        if (opts.json) {
          console.log(JSON.stringify({ [opts.getKey]: val }, null, 2));
        } else {
          console.log(`${opts.getKey}: ${val}`);
        }
        return { success: true, value: val };
      }

      if (opts.json) {
        console.log(JSON.stringify({ success: true, config: currentConfig }, null, 2));
      } else {
        console.log(`\n================= PROJECT CONFIGURATION =================`);
        console.log(`Project ID   : ${currentConfig?.projectId}`);
        console.log(`Default Org  : ${currentConfig?.defaultOrgId || "(None)"}`);
        console.log(`Budget Limit : $${currentConfig?.budgetLimitUsd?.toFixed(2)}`);
        console.log(`=========================================================\n`);
      }

      return {
        success: true,
        config: currentConfig,
      };
    }

    // Default: list projects
    let projects = repo.findAll();
    if (projects.length === 0) {
      // Seed default project for current directory
      const seeded = repo.create({
        id: "default",
        name: "Default Workspace Project",
        rootPath: process.cwd(),
      });
      projects = [seeded];
    }

    if (opts.json) {
      console.log(JSON.stringify({ success: true, projects }, null, 2));
    } else {
      console.log(`\n==================== WORKSPACE PROJECTS ====================`);
      console.log(`Total Projects: ${projects.length}`);
      console.log(`------------------------------------------------------------`);
      for (const p of projects) {
        console.log(`[${p.id}] ${p.name.padEnd(28)} Path: ${p.rootPath}`);
      }
      console.log(`============================================================\n`);
    }

    return {
      success: true,
      projects,
    };
  } finally {
    db.close();
  }
}
