//! TCP-клиент мессенджера.
//!
//! Реализует подключение, фоновое чтение и запись через tokio.
//! Прочитанные пакеты отправляются в React через Tauri events.

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::collections::HashMap;

use tokio::io::{BufReader, BufWriter, AsyncBufReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};

use tauri::{AppHandle, Emitter};

use crate::protocol::{encode_text, make_login, parse_packet, ServerPacket};
use crate::state::AppState;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub name: String,
    pub clients: Vec<String>,
    pub client_platforms: HashMap<String, String>,
}

fn parse_client_names(payload: &str) -> Vec<String> {
    payload
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn parse_client_platforms(payload: &str) -> HashMap<String, String> {
    let parsed = serde_json::from_str::<HashMap<String, String>>(payload).unwrap_or_default();

    parsed
        .into_iter()
        .map(|(name, platform)| {
            let normalized = match platform.as_str() {
                "android" => "android",
                "desktop" => "desktop",
                _ => "unknown",
            };
            (name, normalized.to_string())
        })
        .collect()
}

fn queue_packet(state: &AppState, packet: ServerPacket) {
    if packet.command == "CLIENTS" {
        state.set_clients(parse_client_names(&packet.payload));
    } else if packet.command == "CLIENTS_META" {
        state.set_client_platforms(parse_client_platforms(&packet.payload));
    }
    state.push_packet(packet);
}

/// Подключается к серверу, выполняет LOGIN и запускает фоновые задачи.
///
/// Возвращает `Ok(ConnectResult)` при успешной регистрации,
/// `Err(message)` — при ошибке.
pub async fn do_connect(
    app: AppHandle,
    state: Arc<AppState>,
    host: &str,
    port: u16,
    name: &str,
) -> Result<ConnectResult, String> {
    let addr = format!("{}:{}", host, port);

    let stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("Не удалось подключиться к {}:{} — {}", host, port, e))?;

    let (read_half, write_half) = stream.into_split();
    let mut reader = BufReader::new(read_half);
    let mut writer = BufWriter::new(write_half);

    // Отправляем LOGIN|имя
    let login_packet = make_login(name, "desktop");
    writer
        .write_all(format!("{}\n", login_packet).as_bytes())
        .await
        .map_err(|e| format!("Ошибка отправки LOGIN: {}", e))?;
    writer
        .flush()
        .await
        .map_err(|e| format!("Ошибка flush: {}", e))?;

    // Читаем первую строку ответа
    let mut first_line = String::new();
    reader
        .read_line(&mut first_line)
        .await
        .map_err(|e| format!("Ошибка чтения ответа: {}", e))?;

    let first_line = first_line.trim_end_matches(['\n', '\r']);
    let packet = parse_packet(first_line);

    if packet.command == "ERROR" {
        return Err(packet.payload);
    }

    if packet.command != "LOGIN_OK" {
        return Err(format!(
            "Неожиданный ответ сервера: {}",
            first_line
        ));
    }

    let confirmed_name = if packet.payload.is_empty() {
        name.to_string()
    } else {
        packet.payload
    };

    // Сразу запрашиваем список клиентов, чтобы фронтенд не зависел
    // только от асинхронного broadcast/listen-path после подключения.
    writer
        .write_all(b"LIST|\n")
        .await
        .map_err(|e| format!("Ошибка отправки LIST: {}", e))?;
    writer
        .flush()
        .await
        .map_err(|e| format!("Ошибка flush LIST: {}", e))?;

    let mut initial_clients = vec![confirmed_name.clone()];
    let mut initial_client_platforms = HashMap::from([(
        confirmed_name.clone(),
        "desktop".to_string(),
    )]);
    let mut buffered_packets = Vec::new();
    let mut saw_clients = false;
    let mut saw_client_platforms = false;

    loop {
        let mut line = String::new();
        let read_result = timeout(Duration::from_millis(250), reader.read_line(&mut line)).await;
        let bytes_read = match read_result {
            Ok(Ok(bytes)) => bytes,
            Ok(Err(e)) => return Err(format!("Ошибка чтения списка клиентов: {}", e)),
            Err(_) => break,
        };

        if bytes_read == 0 {
            break;
        }

        let trimmed = line.trim_end_matches(['\n', '\r']);
        if trimmed.is_empty() {
            continue;
        }

        let packet = parse_packet(trimmed);
        if packet.command == "CLIENTS" {
            let names = parse_client_names(&packet.payload);

            if !names.is_empty() {
                initial_clients = names;
            }
            saw_clients = true;
            if saw_client_platforms {
                break;
            }
            continue;
        }

        if packet.command == "CLIENTS_META" {
            let platforms = parse_client_platforms(&packet.payload);
            if !platforms.is_empty() {
                initial_client_platforms = platforms;
            }
            saw_client_platforms = true;
            if saw_clients {
                break;
            }
            continue;
        }

        buffered_packets.push(packet);
    }

    // Канал для отправки строк в TCP
    let (tx, rx) = mpsc::channel::<String>(256);

    *state.sender.lock().unwrap() = Some(tx);
    state.connected.store(true, Ordering::SeqCst);
    state.set_clients(initial_clients.clone());
    state.set_client_platforms(initial_client_platforms.clone());
    state.packet_queue.lock().unwrap().clear();

    // Фоновая задача чтения
    let app_read = app.clone();
    let state_read = state.clone();
    tokio::spawn(async move {
        read_loop(app_read, state_read, reader, buffered_packets).await;
    });

    // Фоновая задача записи
    let app_write = app.clone();
    let state_write = state.clone();
    tokio::spawn(async move {
        write_loop(app_write, state_write, writer, rx).await;
    });

    Ok(ConnectResult {
        name: confirmed_name,
        clients: initial_clients,
        client_platforms: initial_client_platforms,
    })
}

/// Фоновая задача чтения строк из TCP.
///
/// Каждая строка парсится и отправляется в React через event `server-packet`.
/// При обрыве соединения — отправляет event `disconnected`.
async fn read_loop(
    app: AppHandle,
    state: Arc<AppState>,
    mut reader: BufReader<tokio::net::tcp::OwnedReadHalf>,
    buffered_packets: Vec<crate::protocol::ServerPacket>,
) {
    for packet in buffered_packets {
        queue_packet(&state, packet.clone());
        let _ = app.emit("server-packet", &packet);
    }

    loop {
        let mut line = String::new();
        match reader.read_line(&mut line).await {
            Ok(0) => {
                // Соединение закрыто сервером
                break;
            }
            Ok(_) => {
                let trimmed = line.trim_end_matches(['\n', '\r']);
                if trimmed.is_empty() {
                    continue;
                }
                let packet = parse_packet(trimmed);
                queue_packet(&state, packet.clone());
                let _ = app.emit("server-packet", &packet);
            }
            Err(_) => {
                break;
            }
        }
    }

    handle_disconnect(&app, &state);
}

/// Фоновая задача записи строк в TCP.
///
/// Читает строки из mpsc-канала и записывает в сокет.
/// При падении отправки — отправляет event `connection-error`.
async fn write_loop(
    app: AppHandle,
    state: Arc<AppState>,
    mut writer: BufWriter<tokio::net::tcp::OwnedWriteHalf>,
    mut rx: mpsc::Receiver<String>,
) {
    while let Some(line) = rx.recv().await {
        if let Err(e) = writer.write_all(format!("{}\n", line).as_bytes()).await {
            queue_packet(
                &state,
                ServerPacket {
                    command: "ERROR".to_string(),
                    payload: encode_text(&format!("Ошибка отправки: {}", e)),
                },
            );
            let _ = app.emit(
                "connection-error",
                serde_json::json!({ "message": format!("Ошибка отправки: {}", e) }),
            );
            break;
        }
        if let Err(e) = writer.flush().await {
            queue_packet(
                &state,
                ServerPacket {
                    command: "ERROR".to_string(),
                    payload: encode_text(&format!("Ошибка flush: {}", e)),
                },
            );
            let _ = app.emit(
                "connection-error",
                serde_json::json!({ "message": format!("Ошибка flush: {}", e) }),
            );
            break;
        }
    }

    handle_disconnect(&app, &state);
}

/// Общие действия при отключении: сброс состояния, уведомление фронтенда.
fn handle_disconnect(app: &AppHandle, state: &AppState) {
    if state.connected.swap(false, Ordering::SeqCst) {
        *state.sender.lock().unwrap() = None;
        state.set_clients(Vec::new());
        state.set_client_platforms(HashMap::new());
        queue_packet(
            state,
            ServerPacket {
                command: "DISCONNECTED".to_string(),
                payload: String::new(),
            },
        );
        let _ = app.emit("disconnected", ());
    }
}
