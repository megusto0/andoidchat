# Android Client

This is the Android Kotlin client inside the monorepo.

## Requirements

- Android Studio Koala or newer
- Android SDK 35
- JDK 17

## Run

1. Start the TCP server from the monorepo root:

```bash
python3 services/tcp-server/server_async.py 5000
```

2. Open `apps/android/` in Android Studio.
3. Let Studio install the Android SDK/Gradle components it requests.
4. Run the `app` configuration on an emulator or device.

## What it supports

- `LOGIN|name`, `LIST|`, `QUIT|`
- JSON `MESSAGE|...` payloads with `mode`, `targets`, `content`
- General / Self / Group chat contexts
- Chat bubbles above the composer for switching contexts
- Clickable recipient rows instead of checkboxes
- Targeted sends handled by the existing Python server

## Notes

- This machine may still need Android SDK/JDK setup in Android Studio.
- The Android client intentionally mirrors the current desktop protocol and reducer logic instead of embedding the Tauri frontend.
