import net from "node:net";
import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { forwardSignalsToChild, spawnCommand } from "./spawn-command.mjs";

const host = "127.0.0.1";
const port = 1420;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");

function canConnect(hostname, portNumber) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port: portNumber });

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function fetchRoot(hostname, portNumber) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: hostname,
        port: portNumber,
        path: "/",
        timeout: 1000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

function isExpectedDesktopPage(response) {
  if (!response || response.statusCode !== 200) {
    return false;
  }

  return (
    response.body.includes("<title>TCP Messenger</title>") &&
    response.body.includes('/src/main.tsx')
  );
}

async function killListener(portNumber) {
  const lsofCmd =
    process.platform === "win32"
      ? null
      : `lsof -t -iTCP:${portNumber} -sTCP:LISTEN`;

  if (!lsofCmd) {
    return false;
  }

  const { execSync } = await import("node:child_process");

  try {
    const output = execSync(lsofCmd, { encoding: "utf8" }).trim();
    if (!output) {
      return false;
    }

    for (const pid of output.split(/\s+/)) {
      if (!pid) continue;
      process.kill(Number(pid), "SIGTERM");
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < 3000) {
      if (!(await canConnect(host, portNumber))) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return true;
  } catch {
    return false;
  }
}

if (await canConnect(host, port)) {
  const response = await fetchRoot(host, port);
  if (isExpectedDesktopPage(response)) {
    console.log(`Vite dev server already running on http://${host}:${port}, reusing it.`);
    process.exit(0);
  }

  console.log(`Port ${port} is occupied by a stale or incompatible dev server, restarting it.`);
  await killListener(port);
}

const viteCmd = path.join(projectDir, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
if (!existsSync(viteCmd)) {
  console.error("Missing local Vite binary. Run `npm run desktop:install` and try again.");
  process.exit(1);
}

const child = spawnCommand(viteCmd, ["--host", host, "--port", String(port), "--strictPort"], {
  stdio: "inherit",
  cwd: projectDir,
});

forwardSignalsToChild(child);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
