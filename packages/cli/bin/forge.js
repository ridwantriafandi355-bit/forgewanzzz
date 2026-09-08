#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { runCli } from "../dist/cli.js";

// Auto-load .env file if present in workspace root
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const eqIdx = trimmed.indexOf("=");
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

runCli(process.argv).catch((err) => {
  console.error("[Forge CLI Error]:", err);
  process.exit(1);
});
