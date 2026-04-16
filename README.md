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

Start the server:

```bash
npm run server:start
```

Build the desktop frontend:

```bash
npm run desktop:install
npm run desktop:build
```

Run the desktop app:

```bash
npm run desktop:tauri
```

Build the Android client:

```bash
npm run android:build
```

## Direct Paths

- Android app: `apps/android`
- Desktop app: `apps/desktop`
- Server: `services/tcp-server/server_async.py`
- CLI client: `tools/cli-client/client.py`
- Load test: `tools/load-test/load_test.py`
