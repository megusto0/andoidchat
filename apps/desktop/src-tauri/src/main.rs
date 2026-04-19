//! Точка входа Tauri-приложения TCP Messenger.
//!
//! Регистрирует команды для React-фронтенда и запускает окно.

mod protocol;
mod simulator;
mod state;
mod tcp_client;
mod udp_discovery;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use state::AppState;
use tauri::Emitter;
use tcp_client::{ConnectResult, do_connect};

/// Подключается к серверу мессенджера.
///
/// Вызывается из JS: `invoke("connect", { host, port, name })`.
#[tauri::command]
async fn connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    host: String,
    port: u16,
    name: String,
) -> Result<ConnectResult, String> {
    do_connect(app, state.inner().clone(), &host, port, &name).await
}

/// Отправляет текстовое сообщение.
///
/// Вызывается из JS: `invoke("send_message", { text })`.
#[tauri::command]
async fn send_message(
    state: tauri::State<'_, Arc<AppState>>,
    text: String,
    mode: String,
    targets: Vec<String>,
) -> Result<(), String> {
    let sender = state
        .sender
        .lock()
        .unwrap()
        .clone()
        .ok_or("Не подключено".to_string())?;

    let payload = serde_json::json!({
        "mode": mode,
        "targets": targets,
        "content": text,
    });

    sender
        .send(format!("MESSAGE|{}", payload))
        .await
        .map_err(|e| format!("Ошибка отправки: {}", e))
}

/// Отправляет произвольную команду протокола.
///
/// Вызывается из JS: `invoke("send_command", { raw })`.
/// Используется для GROUP|..., LIST|, QUIT|.
#[tauri::command]
async fn send_command(
    state: tauri::State<'_, Arc<AppState>>,
    raw: String,
) -> Result<(), String> {
    let sender = state
        .sender
        .lock()
        .unwrap()
        .clone()
        .ok_or("Не подключено".to_string())?;

    sender
        .send(raw)
        .await
        .map_err(|e| format!("Ошибка отправки: {}", e))
}

/// Возвращает накопленные входящие пакеты от сервера и очищает очередь.
#[tauri::command]
async fn drain_packets(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<protocol::ServerPacket>, String> {
    Ok(state.drain_packets())
}

/// Возвращает последний известный список клиентов.
#[tauri::command]
async fn get_clients(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<String>, String> {
    Ok(state.get_clients())
}

/// Возвращает последний известный map платформ клиентов.
#[tauri::command]
async fn get_client_platforms(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<std::collections::HashMap<String, String>, String> {
    Ok(state.get_client_platforms())
}

/// Ищет TCP-сервер в локальной сети через UDP broadcast.
#[tauri::command]
async fn discover_server(
    timeout_ms: Option<u64>,
) -> Result<Option<udp_discovery::DiscoveryResult>, String> {
    udp_discovery::discover_server(timeout_ms.unwrap_or(1500)).await
}

/// Отключается от сервера.
///
/// Отправляет QUIT|, закрывает канал, уведомляет фронтенд.
#[tauri::command]
async fn disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let sender = state.sender.lock().unwrap().take();

    if let Some(tx) = sender {
        let _ = tx.send("QUIT|".to_string()).await;
    }

    state.connected.store(false, Ordering::SeqCst);
    state.set_clients(Vec::new());
    state.set_client_platforms(std::collections::HashMap::new());
    state.push_packet(protocol::ServerPacket {
        command: "DISCONNECTED".to_string(),
        payload: String::new(),
    });
    let _ = app.emit("disconnected", ());

    Ok(())
}

/// Запускает симуляцию нагрузочного тестирования.
///
/// Вызывается из JS: `invoke("start_simulation", { host, port, count })`.
#[tauri::command]
async fn start_simulation(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    host: String,
    port: u16,
    count: Option<u16>,
) -> Result<(), String> {
    let n = count.unwrap_or(55);
    let cancel = Arc::new(AtomicBool::new(false));

    {
        let mut guard = state.simulation_cancel.lock().unwrap();
        if let Some(previous) = guard.replace(cancel.clone()) {
            previous.store(true, Ordering::SeqCst);
        }
    }

    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    tokio::spawn(async move {
        let _ = simulator::run_simulation(app_clone, state_clone, host, port, n, cancel).await;
    });

    Ok(())
}

/// Останавливает текущую симуляцию.
///
/// Вызывается из JS: `invoke("stop_simulation")`.
#[tauri::command]
async fn stop_simulation(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    if let Some(cancel) = state.simulation_cancel.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// Возвращает последний snapshot метрик симуляции.
#[tauri::command]
async fn get_simulation_metrics(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<simulator::SimMetrics, String> {
    Ok(state.get_simulation_metrics())
}

/// Сворачивает текущее окно приложения.
#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| format!("Не удалось свернуть окно: {}", e))
}

/// Переключает состояние maximized для текущего окна и возвращает новое состояние.
#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<bool, String> {
    let is_maximized = window
        .is_maximized()
        .map_err(|e| format!("Не удалось прочитать состояние окна: {}", e))?;

    if is_maximized {
        window
            .unmaximize()
            .map_err(|e| format!("Не удалось восстановить окно: {}", e))?;
        Ok(false)
    } else {
        window
            .maximize()
            .map_err(|e| format!("Не удалось развернуть окно: {}", e))?;
        Ok(true)
    }
}

/// Возвращает, развернуто ли текущее окно.
#[tauri::command]
fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window
        .is_maximized()
        .map_err(|e| format!("Не удалось прочитать состояние окна: {}", e))
}

/// Закрывает текущее окно приложения.
#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| format!("Не удалось закрыть окно: {}", e))
}

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            connect,
            send_message,
            send_command,
            drain_packets,
            get_clients,
            get_client_platforms,
            discover_server,
            disconnect,
            start_simulation,
            stop_simulation,
            get_simulation_metrics,
            window_minimize,
            window_toggle_maximize,
            window_is_maximized,
            window_close,
        ])
        .run(tauri::generate_context!())
        .expect("Ошибка запуска Tauri");
}
