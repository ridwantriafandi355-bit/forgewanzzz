#!/usr/bin/env node
import { runCli } from "../dist/cli.js";

runCli(process.argv).catch((err) => {
  console.error("[Forge CLI Error]:", err);
  process.exit(1);
});
