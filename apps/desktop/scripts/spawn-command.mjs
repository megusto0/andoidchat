import { spawn } from "node:child_process";

function quoteWindowsArg(arg) {
  if (arg.length === 0) {
    return '""';
  }

  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

export function spawnCommand(command, args, options = {}) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const commandLine = [command, ...args].map((arg) => quoteWindowsArg(String(arg))).join(" ");
    return spawn(process.env.comspec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], options);
  }

  return spawn(command, args, options);
}

export function forwardSignalsToChild(child) {
  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));
}
