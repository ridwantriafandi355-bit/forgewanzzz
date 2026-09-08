import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { orgCommand } from "../src/commands/org.js";
import { projectCommand } from "../src/commands/project.js";
import { runCli } from "../src/cli.js";

describe("Forge CLI Org & Project Management (Doc 16)", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-org-cli-test-"));
    const forgeDir = path.join(tempDir, ".forge");
    await fs.mkdir(forgeDir, { recursive: true });
    dbPath = path.join(forgeDir, "forge.db");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("forge org create and list manages persistent AI organizations", async () => {
    const createRes = await orgCommand({
      subcommand: "create",
      orgId: "org_alpha_cli",
      name: "Alpha AI Squad",
      maxAgents: 8,
      dbPath,
    });

    expect(createRes.success).toBe(true);
    expect(createRes.created?.id).toBe("org_alpha_cli");
    expect(createRes.created?.maxAgents).toBe(8);

    const listRes = await orgCommand({
      subcommand: "list",
      dbPath,
    });

    expect(listRes.success).toBe(true);
    expect(listRes.organizations).toHaveLength(1);
    expect(listRes.organizations![0].id).toBe("org_alpha_cli");
  });

  it("forge project config updates and queries configuration", async () => {
    const setRes = await projectCommand({
      subcommand: "config",
      projectId: "proj_custom",
      setKey: "budget",
      setValue: "350.50",
      dbPath,
    });

    expect(setRes.success).toBe(true);
    expect(setRes.config?.budgetLimitUsd).toBe(350.5);

    const getRes = await projectCommand({
      subcommand: "config",
      projectId: "proj_custom",
      getKey: "budgetLimitUsd",
      dbPath,
    });

    expect(getRes.success).toBe(true);
    expect(getRes.value).toBe(350.5);
  });

  it("runCli executes 'org list' and 'project list' cleanly", async () => {
    await expect(
      runCli(["node", "forge", "org", "list", "--json"])
    ).resolves.not.toThrow();

    await expect(
      runCli(["node", "forge", "project", "list", "--json"])
    ).resolves.not.toThrow();
  });
});
