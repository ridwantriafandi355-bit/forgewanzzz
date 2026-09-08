import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli } from "../src/cli.js";
import { reviewCommand } from "../src/commands/review.js";

describe("Forge CLI Review Command (Doc 02 & Doc 03)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "forge-cli-review-"));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("reviews a clean local file via reviewCommand and returns passed assessment", async () => {
    const cleanFilePath = path.join(tempDir, "calculator.ts");
    await fs.promises.writeFile(
      cleanFilePath,
      "export function subtract(a: number, b: number): number {\n  return a - b;\n}\n",
      "utf-8"
    );

    const assessment = await reviewCommand({
      filePath: cleanFilePath,
      json: true,
    });

    expect(assessment).toBeDefined();
    expect(assessment?.passed).toBe(true);
    expect(assessment?.overallScore).toBeGreaterThanOrEqual(70);
    expect(assessment?.criteria?.securityAudit.passed).toBe(true);
  });

  it("detects vulnerabilities when reviewing an insecure file via reviewCommand", async () => {
    const vulnFilePath = path.join(tempDir, "insecure.ts");
    await fs.promises.writeFile(
      vulnFilePath,
      'const apiKey = "sk-abcdef1234567890abcdef1234567890";\neval("console.log(1)");\n',
      "utf-8"
    );

    const assessment = await reviewCommand({
      filePath: vulnFilePath,
      json: true,
    });

    expect(assessment).toBeDefined();
    expect(assessment?.passed).toBe(false);
    expect(assessment?.issues?.some((i) => i.rule === "security.hardcoded-api-key")).toBe(true);
    expect(assessment?.issues?.some((i) => i.rule === "security.dangerous-eval")).toBe(true);
  });

  it("runCli executes 'review --file' without throwing", async () => {
    const cleanFilePath = path.join(tempDir, "clean.ts");
    await fs.promises.writeFile(
      cleanFilePath,
      "export const PI = 3.14159;\n",
      "utf-8"
    );

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCli(["node", "forge", "review", "--file", cleanFilePath, "--json"]);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
