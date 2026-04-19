import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forwardSignalsToChild, spawnCommand } from "./spawn-command.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const srcTauriDir = path.join(projectDir, "src-tauri");

function getLocalBin(name) {
  return path.join(projectDir, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
}

function getPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function addCargoToPath(env) {
  const nextEnv = { ...env };
  const pathKey = getPathKey(nextEnv);
  const currentPath = nextEnv[pathKey] ?? "";

  if (process.platform !== "win32") {
    return {
      env: nextEnv,
      addedCargoPath: false,
    };
  }

  const cargoBin = path.join(os.homedir(), ".cargo", "bin");
  const cargoExe = path.join(cargoBin, "cargo.exe");
  if (!existsSync(cargoExe)) {
    return {
      env: nextEnv,
      addedCargoPath: false,
      cargoBin,
    };
  }

  const hasCargoPath = currentPath
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => entry.toLowerCase() === cargoBin.toLowerCase());

  if (!hasCargoPath) {
    nextEnv[pathKey] = [cargoBin, currentPath].filter(Boolean).join(path.delimiter);
    return {
      env: nextEnv,
      addedCargoPath: true,
      cargoBin,
    };
  }

  return {
    env: nextEnv,
    addedCargoPath: false,
    cargoBin,
  };
}

function findOnPath(command, env) {
  const pathKey = getPathKey(env);
  const searchPath = env[pathKey] ?? "";
  const directories = searchPath.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  if (path.isAbsolute(command) && existsSync(command)) {
    return command;
  }

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = process.platform === "win32" ? path.join(directory, `${command}${extension}`) : path.join(directory, command);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function fail(lines) {
  for (const line of Array.isArray(lines) ? lines : [lines]) {
    console.error(line);
  }
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const checkOnly = rawArgs.includes("--check");
const filteredArgs = rawArgs.filter((arg) => arg !== "--check");
const requestedCommand =
  filteredArgs[0] === "dev" || filteredArgs[0] === "build"
    ? filteredArgs[0]
    : "dev";
const tauriArgs =
  filteredArgs[0] === requestedCommand ? filteredArgs.slice(1) : filteredArgs;

const tauriBin = getLocalBin("tauri");
const viteBin = getLocalBin("vite");
const iconPng = path.join(srcTauriDir, "icons", "icon.png");
const iconIco = path.join(srcTauriDir, "icons", "icon.ico");

if (!existsSync(tauriBin) || !existsSync(viteBin)) {
  fail([
    "Desktop dependencies are not installed.",
    "Run `npm run desktop:install` and try again.",
  ]);
}

const { env, addedCargoPath, cargoBin } = addCargoToPath(process.env);
if (!findOnPath("cargo", env)) {
  fail([
    "Rust toolchain was not found on PATH.",
    process.platform === "win32"
      ? `Install Rust with rustup, then reopen your terminal. Expected cargo in ${cargoBin}.`
      : "Install Rust with rustup and ensure `cargo` is available on PATH.",
  ]);
}

if (!existsSync(iconPng)) {
  fail(`Missing Tauri icon file: ${iconPng}`);
}

if (process.platform === "win32" && !existsSync(iconIco)) {
  fail([
    `Missing Windows Tauri icon file: ${iconIco}`,
    "Keep both `icon.png` and `icon.ico` in `apps/desktop/src-tauri/icons`.",
  ]);
}

if (addedCargoPath) {
  console.log(`Added ${cargoBin} to PATH for this run.`);
}

if (checkOnly) {
  console.log("Desktop preflight OK.");
  process.exit(0);
}

const child = spawnCommand(tauriBin, [requestedCommand, ...tauriArgs], {
  cwd: projectDir,
  env,
  stdio: "inherit",
});

forwardSignalsToChild(child);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
