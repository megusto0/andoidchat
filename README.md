# Android Client

This is a standalone Android Kotlin client for the TCP messenger server in the repo root.

## Requirements

- Android Studio Koala or newer
- Android SDK 35
- JDK 17

## Run

1. Start the TCP server from the repo root:

```bash
python3 server_async.py 5000
```

2. Open `android-client/` in Android Studio.
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

- This machine does not have the Android SDK installed, so the project could not be assembled locally here.
- The Android client intentionally mirrors the current desktop protocol and reducer logic instead of embedding the Tauri frontend.
