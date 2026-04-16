//! Симулятор нагрузочного тестирования.
//!
//! Создаёт N TCP-ботов, удерживает их онлайн несколько секунд и
//! периодически отправляет сообщения. Последний snapshot метрик
//! хранится в `AppState` и параллельно шлётся в React через Tauri events.

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering as AtomicOrdering};

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use crate::state::AppState;

const BOT_CONNECT_STAGGER_MS: u64 = 20;
const SIMULATION_WINDOW_SECS: u64 = 12;
const POST_CONNECT_SETTLE_MS: u64 = 450;
const MESSAGE_INTERVAL_BASE_MS: u64 = 650;
const MESSAGE_INTERVAL_STEP_MS: u64 = 45;

/// Метрики симуляции, отправляемые в React.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimMetrics {
    pub active_clients: u32,
    pub total_connected: u32,
    pub failed_connections: u32,
    pub messages_sent: u32,
    pub messages_received: u32,
    pub echo_confirmed: u32,
    pub server_responses_confirmed: u32,
    pub incorrect_responses: u32,
    pub avg_response_ms: f64,
    pub messages_per_second: f64,
    pub elapsed_seconds: f64,
    pub phase: String,
    pub bot_statuses: Vec<BotStatus>,
}

impl Default for SimMetrics {
    fn default() -> Self {
        Self {
            active_clients: 0,
            total_connected: 0,
            failed_connections: 0,
            messages_sent: 0,
            messages_received: 0,
            echo_confirmed: 0,
            server_responses_confirmed: 0,
            incorrect_responses: 0,
            avg_response_ms: 0.0,
            messages_per_second: 0.0,
            elapsed_seconds: 0.0,
            phase: "idle".to_string(),
            bot_statuses: Vec::new(),
        }
    }
}

/// Статус одного бота.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BotStatus {
    pub name: String,
    pub status: String,
    pub messages_sent: u32,
}

struct SimState {
    cancel: Arc<AtomicBool>,
    total_connected: AtomicU32,
    failed_connections: AtomicU32,
    messages_sent: AtomicU32,
    messages_received: AtomicU32,
    echo_confirmed: AtomicU32,
    server_responses_confirmed: AtomicU32,
    incorrect_responses: AtomicU32,
    active_clients: AtomicU32,
    bots: Arc<Mutex<Vec<BotStatus>>>,
    response_times_ms: Arc<Mutex<Vec<f64>>>,
}

impl SimState {
    fn new(cancel: Arc<AtomicBool>) -> Self {
        Self {
            cancel,
            total_connected: AtomicU32::new(0),
            failed_connections: AtomicU32::new(0),
            messages_sent: AtomicU32::new(0),
            messages_received: AtomicU32::new(0),
            echo_confirmed: AtomicU32::new(0),
            server_responses_confirmed: AtomicU32::new(0),
            incorrect_responses: AtomicU32::new(0),
            active_clients: AtomicU32::new(0),
            bots: Arc::new(Mutex::new(Vec::new())),
            response_times_ms: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[derive(Debug, Clone)]
struct PendingExpectation {
    original_text: String,
    sent_at: Instant,
}

const PALINDROME_WORDS: &[&str] = &["Anna", "шалаш", "madam", "radar"];
const MARKER: &str = "<@>";
const NON_PALINDROME: &str = "test";

pub async fn run_simulation(
    app: AppHandle,
    state: Arc<AppState>,
    host: String,
    port: u16,
    count: u16,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let sim = Arc::new(SimState::new(cancel));
    let start = Instant::now();

    {
        let mut bots = sim.bots.lock().await;
        for i in 1..=count {
            bots.push(BotStatus {
                name: format!("sim_bot_{:03}", i),
                status: "connecting".to_string(),
                messages_sent: 0,
            });
        }
    }

    publish_metrics(&app, &state, snapshot_metrics(&sim, start, "connecting").await);

    let app_metrics = app.clone();
    let state_metrics = state.clone();
    let sim_metrics = sim.clone();
    let cancel_metrics = sim.cancel.clone();
    let metrics_handle = tokio::spawn(async move {
        loop {
            if cancel_metrics.load(AtomicOrdering::Relaxed) {
                break;
            }

            tokio::time::sleep(Duration::from_millis(200)).await;
            let metrics = snapshot_metrics(&sim_metrics, start, detect_phase(&sim_metrics).await).await;
            publish_metrics(&app_metrics, &state_metrics, metrics);
        }
    });

    let active_until = start + Duration::from_secs(SIMULATION_WINDOW_SECS);
    let mut handles = Vec::new();
    for i in 1..=count {
        if sim.cancel.load(AtomicOrdering::Relaxed) {
            break;
        }

        let bot_name = format!("sim_bot_{:03}", i);
        let host = host.clone();
        let sim = sim.clone();
        let bot_idx = (i - 1) as usize;
        let active_until = active_until;

        let handle = tokio::spawn(async move {
            run_bot(&host, port, &bot_name, bot_idx, &sim, active_until).await;
        });
        handles.push(handle);

        tokio::time::sleep(Duration::from_millis(BOT_CONNECT_STAGGER_MS)).await;
    }

    for handle in handles {
        let _ = handle.await;
    }

    let final_metrics = snapshot_metrics(&sim, start, "done").await;
    publish_metrics(&app, &state, final_metrics);

    metrics_handle.abort();

    let mut cancel_guard = state.simulation_cancel.lock().unwrap();
    if cancel_guard
        .as_ref()
        .is_some_and(|current| Arc::ptr_eq(current, &sim.cancel))
    {
        cancel_guard.take();
    }

    Ok(())
}

async fn run_bot(
    host: &str,
    port: u16,
    name: &str,
    bot_idx: usize,
    sim: &Arc<SimState>,
    active_until: Instant,
) {
    let addr = format!("{host}:{port}");
    let stream = match TcpStream::connect(&addr).await {
        Ok(stream) => stream,
        Err(_) => {
            sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
            update_bot_status(sim, bot_idx, "error", None).await;
            return;
        }
    };

    let (read_half, write_half) = stream.into_split();
    let mut reader = tokio::io::BufReader::new(read_half);
    let mut writer = tokio::io::BufWriter::new(write_half);

    let login_payload = serde_json::json!({
        "name": name,
        "platform": "desktop",
    });

    let login = format!("LOGIN|{login_payload}\n");
    if writer.write_all(login.as_bytes()).await.is_err() || writer.flush().await.is_err() {
        sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
        update_bot_status(sim, bot_idx, "error", None).await;
        return;
    }

    let mut first_line = String::new();
    match reader.read_line(&mut first_line).await {
        Ok(0) | Err(_) => {
            sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
            update_bot_status(sim, bot_idx, "error", None).await;
            return;
        }
        _ => {}
    }

    if !first_line.trim().starts_with("LOGIN_OK") {
        sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
        update_bot_status(sim, bot_idx, "error", None).await;
        return;
    }

    sim.total_connected.fetch_add(1, AtomicOrdering::Relaxed);
    sim.active_clients.fetch_add(1, AtomicOrdering::Relaxed);
    update_bot_status(sim, bot_idx, "active", Some(0)).await;

    let pending_echoes = Arc::new(Mutex::new(VecDeque::<PendingExpectation>::new()));
    let pending_server = Arc::new(Mutex::new(VecDeque::<PendingExpectation>::new()));

    let sim_read = sim.clone();
    let bot_name = name.to_string();
    let read_cancel = sim.cancel.clone();
    let pending_echoes_read = pending_echoes.clone();
    let pending_server_read = pending_server.clone();
    let read_handle = tokio::spawn(async move {
        loop {
            if read_cancel.load(AtomicOrdering::Relaxed) {
                break;
            }

            let mut line = String::new();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let Some((command, payload)) = trimmed.split_once('|') else {
                        continue;
                    };

                    if command != "MESSAGE" {
                        continue;
                    }

                    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(payload) else {
                        continue;
                    };

                    sim_read.messages_received.fetch_add(1, AtomicOrdering::Relaxed);

                    let sender = parsed
                        .get("sender")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default();
                    let text = parsed
                        .get("content")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default();

                    if sender == bot_name {
                        let pending = { pending_echoes_read.lock().await.pop_front() };
                        if let Some(expectation) = pending {
                            if expectation.original_text == text {
                                sim_read.echo_confirmed.fetch_add(1, AtomicOrdering::Relaxed);
                                record_response_time(&sim_read, expectation.sent_at).await;
                            } else {
                                sim_read.incorrect_responses.fetch_add(1, AtomicOrdering::Relaxed);
                            }
                        }
                        continue;
                    }

                    if sender == "Server" {
                        let matched = {
                            let mut queue = pending_server_read.lock().await;
                            let position = queue.iter().position(|expectation| {
                                build_response_text(&expectation.original_text) == text
                            });
                            position.and_then(|idx| queue.remove(idx))
                        };

                        if let Some(expectation) = matched {
                            sim_read
                                .server_responses_confirmed
                                .fetch_add(1, AtomicOrdering::Relaxed);
                            record_response_time(&sim_read, expectation.sent_at).await;
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });

    tokio::time::sleep(Duration::from_millis(POST_CONNECT_SETTLE_MS)).await;

    let mut sequence = 0_u32;
    let mut had_runtime_error = false;
    while !sim.cancel.load(AtomicOrdering::Relaxed) && Instant::now() < active_until {
        let message = build_message(name, sequence);
        let payload = serde_json::json!({
            "mode": "all",
            "targets": [],
            "content": message,
        });
        let packet = format!("MESSAGE|{payload}\n");

        if writer.write_all(packet.as_bytes()).await.is_err() || writer.flush().await.is_err() {
            sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
            update_bot_status(sim, bot_idx, "error", None).await;
            had_runtime_error = true;
            break;
        }

        let expectation = PendingExpectation {
            original_text: message.clone(),
            sent_at: Instant::now(),
        };
        pending_echoes.lock().await.push_back(expectation.clone());
        if message.contains(MARKER) {
            pending_server.lock().await.push_back(expectation);
        }

        let total_sent = sim.messages_sent.fetch_add(1, AtomicOrdering::Relaxed) + 1;
        let _ = total_sent;
        sequence += 1;
        update_bot_status(sim, bot_idx, "active", Some(sequence)).await;

        let interval_ms = MESSAGE_INTERVAL_BASE_MS + ((bot_idx as u64 % 7) * MESSAGE_INTERVAL_STEP_MS);
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }

    let leftover_echoes = pending_echoes.lock().await.len() as u32;
    let leftover_server = pending_server.lock().await.len() as u32;
    if leftover_echoes > 0 || leftover_server > 0 {
        sim.incorrect_responses.fetch_add(
            leftover_echoes + leftover_server,
            AtomicOrdering::Relaxed,
        );
    }

    let _ = writer.write_all(b"QUIT|\n").await;
    let _ = writer.flush().await;
    read_handle.abort();

    sim.active_clients.fetch_sub(1, AtomicOrdering::Relaxed);
    update_bot_status(sim, bot_idx, if had_runtime_error { "error" } else { "done" }, None).await;
}

async fn detect_phase(sim: &Arc<SimState>) -> &'static str {
    let bots = sim.bots.lock().await;
    let connecting = bots.iter().filter(|bot| bot.status == "connecting").count();
    let active = bots.iter().filter(|bot| bot.status == "active").count();
    let errored = bots.iter().filter(|bot| bot.status == "error").count();
    let done = bots.iter().filter(|bot| bot.status == "done").count();

    if active > 0 {
        "messaging"
    } else if connecting > 0 && done == 0 && errored == 0 {
        "connecting"
    } else if done + errored == bots.len() {
        "done"
    } else {
        "disconnecting"
    }
}

async fn snapshot_metrics(sim: &Arc<SimState>, start: Instant, phase: &str) -> SimMetrics {
    let bots = sim.bots.lock().await.clone();
    let response_times = sim.response_times_ms.lock().await.clone();
    let avg_response_ms = if response_times.is_empty() {
        0.0
    } else {
        response_times.iter().sum::<f64>() / response_times.len() as f64
    };

    let elapsed_seconds = start.elapsed().as_secs_f64();
    let messages_received = sim.messages_received.load(AtomicOrdering::Relaxed);
    let messages_per_second = if elapsed_seconds > 0.0 {
        messages_received as f64 / elapsed_seconds
    } else {
        0.0
    };

    SimMetrics {
        active_clients: sim.active_clients.load(AtomicOrdering::Relaxed),
        total_connected: sim.total_connected.load(AtomicOrdering::Relaxed),
        failed_connections: sim.failed_connections.load(AtomicOrdering::Relaxed),
        messages_sent: sim.messages_sent.load(AtomicOrdering::Relaxed),
        messages_received,
        echo_confirmed: sim.echo_confirmed.load(AtomicOrdering::Relaxed),
        server_responses_confirmed: sim
            .server_responses_confirmed
            .load(AtomicOrdering::Relaxed),
        incorrect_responses: sim.incorrect_responses.load(AtomicOrdering::Relaxed),
        avg_response_ms,
        messages_per_second,
        elapsed_seconds,
        phase: phase.to_string(),
        bot_statuses: bots,
    }
}

fn publish_metrics(app: &AppHandle, state: &Arc<AppState>, metrics: SimMetrics) {
    state.set_simulation_metrics(metrics.clone());
    let _ = app.emit("simulation-metrics", &metrics);
}

async fn update_bot_status(
    sim: &Arc<SimState>,
    bot_idx: usize,
    status: &str,
    messages_sent: Option<u32>,
) {
    let mut bots = sim.bots.lock().await;
    if let Some(bot) = bots.get_mut(bot_idx) {
        bot.status = status.to_string();
        if let Some(value) = messages_sent {
            bot.messages_sent = value;
        }
    }
}

async fn record_response_time(sim: &Arc<SimState>, sent_at: Instant) {
    sim.response_times_ms
        .lock()
        .await
        .push(sent_at.elapsed().as_secs_f64() * 1000.0);
}

fn build_message(name: &str, sequence: u32) -> String {
    match sequence % 5 {
        0 => format!("Обычное сообщение {} от {}", sequence + 1, name),
        1 => format!(
            "Проверка <@> {} {} {} {} {} #{}",
            PALINDROME_WORDS[0],
            PALINDROME_WORDS[1],
            PALINDROME_WORDS[2],
            PALINDROME_WORDS[3],
            NON_PALINDROME,
            sequence + 1
        ),
        2 => format!("Нагрузка от {} — сообщение {}", name, sequence + 1),
        3 => format!("Тест <@> {} {} {}", PALINDROME_WORDS[0], NON_PALINDROME, sequence + 1),
        _ => format!("Стабильный поток от {} #{}", name, sequence + 1),
    }
}

fn build_response_text(message: &str) -> String {
    let Some(marker_index) = message.find(MARKER) else {
        return message.to_string();
    };

    let after_marker = message[marker_index + MARKER.len()..].trim();
    if after_marker.is_empty() {
        return format!(
            "Исходное сообщение: {message}\nПосле маркера <@> нет текста для обработки."
        );
    }

    format!(
        "Исходное сообщение: {message}\nРезультат обработки после <@>: {}",
        transform_text(after_marker)
    )
}

fn transform_text(text: &str) -> String {
    text.split_whitespace()
        .map(transform_word)
        .collect::<Vec<_>>()
        .join(" ")
}

fn transform_word(word: &str) -> String {
    let chars: Vec<char> = word.chars().collect();
    let mut start = 0;
    let mut end = chars.len();

    while start < end && !chars[start].is_alphanumeric() {
        start += 1;
    }

    while end > start && !chars[end - 1].is_alphanumeric() {
        end -= 1;
    }

    if start >= end {
        return word.to_string();
    }

    let prefix: String = chars[..start].iter().collect();
    let core: String = chars[start..end].iter().collect();
    let suffix: String = chars[end..].iter().collect();

    let transformed = if is_palindrome(&core) {
        core.to_uppercase()
    } else {
        core
    };

    format!("{prefix}{transformed}{suffix}")
}

fn is_palindrome(word: &str) -> bool {
    let lowered = word.to_lowercase();
    lowered.chars().eq(lowered.chars().rev())
}
