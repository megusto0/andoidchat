# TCP Messenger Monorepo

This repository contains the full TCP Messenger project in a monorepo layout.

## Structure

```text
apps/
  android/   Android Kotlin client
  desktop/   React + Tauri desktop client
services/
  tcp-server/ Python TCP server with UDP discovery
tools/
  cli-client/ Python CLI client
  load-test/  Python load test utility
docs/
  notes/      task notes and scratch docs
```

## Quick Start

Install desktop dependencies:

```bash
npm run desktop:install
```

Check the desktop environment:

```bash
npm run desktop:doctor
```

Start the server:

```bash
npm run server:start
```

Run the desktop app:

```bash
npm run desktop:tauri
```

Build the desktop frontend only:

```bash
npm run desktop:build
```

Build the Android client:

```bash
npm run android:build
```

## Desktop Notes

- The desktop launcher uses the local `apps/desktop/node_modules` binaries instead of `npx`, so run `npm run desktop:install` first.
- Tauri desktop builds require Rust. If Rust was installed with rustup in the default Windows location, `desktop:doctor` and `desktop:tauri` will add `%USERPROFILE%\.cargo\bin` to `PATH` for that run.
- If `desktop:doctor` still reports that `cargo` is missing, reopen the terminal after installing Rust and try again.
- Windows builds need both `apps/desktop/src-tauri/icons/icon.png` and `apps/desktop/src-tauri/icons/icon.ico`. Keep both files when replacing the app icon.

## Direct Paths

- Android app: `apps/android`
- Desktop app: `apps/desktop`
- Server: `services/tcp-server/server_async.py`
- CLI client: `tools/cli-client/client.py`
- Load test: `tools/load-test/load_test.py`
