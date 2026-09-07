import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { verifyCommand } from "./commands/verify.js";
import { uiCommand } from "./commands/ui.js";

export async function runCli(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];

  switch (command) {
    case "init": {
      const res = await initCommand();
      console.log(`[Forge] Initialized workspace at ${res.forgeDir}`);
      break;
    }

    case "run": {
      const missionName = args[1] || "Autonomous Task";
      const goal = args[2] || "Default objective";
      console.log(`[Forge] Starting mission: "${missionName}" - ${goal}`);
      const res = await runCommand({
        missionName,
        goal,
        steps: [{ id: "step-1", title: goal, role: "WORKER", dependencies: [] }],
      });
      console.log(`[Forge] Mission ${res.missionId} finished with status: ${res.status}`);
      break;
    }

    case "status": {
      const res = await statusCommand();
      console.log(`[Forge] Active Missions: ${res.missionsCount}, Tasks: ${res.tasksCount}`);
      break;
    }

    case "verify": {
      const taskId = args[1];
      if (!taskId) {
        console.error("[Forge] Error: taskId argument required.");
        process.exit(1);
      }
      const res = await verifyCommand({ taskId });
      console.log(`[Forge] Verification for task ${taskId}: ${res.passed ? "PASSED" : "FAILED"}`);
      break;
    }

    case "ui": {
      const portArg = args[1] ? parseInt(args[1], 10) : 3000;
      await uiCommand({ port: isNaN(portArg) ? 3000 : portArg });
      break;
    }

    default:
      console.log("Usage: forge <init|run|status|verify|ui>");
      break;
  }
}

