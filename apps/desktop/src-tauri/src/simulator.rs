//! Симулятор нагрузочного тестирования.
//!
//! Создаёт N TCP-ботов, каждый из которых проходит полный цикл:
//! подключение → отправка сообщений → отключение.
//! Метрики отправляются в React через Tauri events каждые 200 мс.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering as AtomicOrdering};
use std::sync::Arc;

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

/// Метрики симуляции, отправляемые в React.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimMetrics {
    pub active_clients: u32,
    pub total_connected: u32,
    pub failed_connections: u32,
    pub messages_sent: u32,
    pub messages_received: u32,
    pub incorrect_responses: u32,
    pub avg_response_ms: f64,
    pub messages_per_second: f64,
    pub elapsed_seconds: f64,
    pub phase: String,
    pub bot_statuses: Vec<BotStatus>,
}

/// Статус одного бота.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BotStatus {
    pub name: String,
    pub status: String,
    pub messages_sent: u32,
}

/// Общее состояние симулятора.
struct SimState {
    cancel: Arc<AtomicBool>,
    total_connected: AtomicU32,
    failed_connections: AtomicU32,
    messages_sent: AtomicU32,
    messages_received: AtomicU32,
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
            incorrect_responses: AtomicU32::new(0),
            active_clients: AtomicU32::new(0),
            bots: Arc::new(Mutex::new(Vec::new())),
            response_times_ms: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

/// Палиндромы для проверки обработки (вариант 16).
const PALINDROME_WORDS: &[&str] = &["Anna", "шалаш", "madam", "radar"];
const MARKER: &str = "<@>";
const NON_PALINDROME: &str = "test";

/// Ожидаемый результат обработки палиндромов сервером.
const EXPECTED_PROCESSED: &str = "ANNA ШАЛАШ MADAM RADAR test";

/// Запускает симуляцию нагрузочного тестирования.
pub async fn run_simulation(
    app: AppHandle,
    host: String,
    port: u16,
    count: u16,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let sim = Arc::new(SimState::new(cancel));
    let start = Instant::now();

    // Инициализация статусов ботов
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

    // Задача периодической отправки метрик
    let app_metrics = app.clone();
    let sim_metrics = sim.clone();
    let cancel_metrics = sim.cancel.clone();
    let metrics_handle = tokio::spawn(async move {
        loop {
            if cancel_metrics.load(AtomicOrdering::Relaxed) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;

            let bots = sim_metrics.bots.lock().await;
            let response_times = sim_metrics.response_times_ms.lock().await;
            let avg = if response_times.is_empty() {
                0.0
            } else {
                response_times.iter().sum::<f64>() / response_times.len() as f64
            };

            let elapsed = start.elapsed().as_secs_f64();
            let mps = if elapsed > 0.0 {
                sim_metrics.messages_received.load(AtomicOrdering::Relaxed) as f64 / elapsed
            } else {
                0.0
            };

            // Определение фазы
            let phase = {
                let connecting = bots.iter().filter(|b| b.status == "connecting").count();
                let active = bots.iter().filter(|b| b.status == "active").count();
                let done = bots.iter().filter(|b| b.status == "done" || b.status == "error").count();

                if done == 0 && connecting > 0 {
                    "connecting"
                } else if active > 0 {
                    "messaging"
                } else if done > 0 && done < bots.len() {
                    "disconnecting"
                } else {
                    "done"
                }
            };

            let metrics = SimMetrics {
                active_clients: sim_metrics.active_clients.load(AtomicOrdering::Relaxed),
                total_connected: sim_metrics.total_connected.load(AtomicOrdering::Relaxed),
                failed_connections: sim_metrics.failed_connections.load(AtomicOrdering::Relaxed),
                messages_sent: sim_metrics.messages_sent.load(AtomicOrdering::Relaxed),
                messages_received: sim_metrics.messages_received.load(AtomicOrdering::Relaxed),
                incorrect_responses: sim_metrics.incorrect_responses.load(AtomicOrdering::Relaxed),
                avg_response_ms: avg,
                messages_per_second: mps,
                elapsed_seconds: elapsed,
                phase: phase.to_string(),
                bot_statuses: bots.clone(),
            };

            drop(bots);
            drop(response_times);

            let _ = app_metrics.emit("simulation-metrics", &metrics);
        }
    });

    // Запуск ботов
    let mut handles = Vec::new();
    for i in 1..=count {
        if sim.cancel.load(AtomicOrdering::Relaxed) {
            break;
        }

        let bot_name = format!("sim_bot_{:03}", i);
        let host = host.clone();
        let sim = sim.clone();
        let app = app.clone();
        let bot_idx = (i - 1) as usize;

        let handle = tokio::spawn(async move {
            run_bot(&host, port, &bot_name, bot_idx, &sim, &app).await;
        });
        handles.push(handle);

        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    // Ожидание завершения всех ботов
    for h in handles {
        let _ = h.await;
    }

    // Финальная отправка метрик
    {
        let bots = sim.bots.lock().await;
        let elapsed = start.elapsed().as_secs_f64();
        let response_times = sim.response_times_ms.lock().await;
        let avg = if response_times.is_empty() {
            0.0
        } else {
            response_times.iter().sum::<f64>() / response_times.len() as f64
        };

        let metrics = SimMetrics {
            active_clients: 0,
            total_connected: sim.total_connected.load(AtomicOrdering::Relaxed),
            failed_connections: sim.failed_connections.load(AtomicOrdering::Relaxed),
            messages_sent: sim.messages_sent.load(AtomicOrdering::Relaxed),
            messages_received: sim.messages_received.load(AtomicOrdering::Relaxed),
            incorrect_responses: sim.incorrect_responses.load(AtomicOrdering::Relaxed),
            avg_response_ms: avg,
            messages_per_second: if elapsed > 0.0 {
                sim.messages_received.load(AtomicOrdering::Relaxed) as f64 / elapsed
            } else {
                0.0
            },
            elapsed_seconds: elapsed,
            phase: "done".to_string(),
            bot_statuses: bots.clone(),
        };

        let _ = app.emit("simulation-metrics", &metrics);
    }

    metrics_handle.abort();

    Ok(())
}

/// Запускает одного бота: подключение → сообщения → отключение.
async fn run_bot(
    host: &str,
    port: u16,
    name: &str,
    bot_idx: usize,
    sim: &Arc<SimState>,
    _app: &AppHandle,
) {
    let addr = format!("{}:{}", host, port);

    let stream = match TcpStream::connect(&addr).await {
        Ok(s) => s,
        Err(_) => {
            sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
            let mut bots = sim.bots.lock().await;
            if bot_idx < bots.len() {
                bots[bot_idx].status = "error".to_string();
            }
            return;
        }
    };

    let (read_half, write_half) = stream.into_split();
    let mut reader = tokio::io::BufReader::new(read_half);
    let mut writer = tokio::io::BufWriter::new(write_half);

    // LOGIN
    let login = format!("LOGIN|{}\n", name);
    if writer.write_all(login.as_bytes()).await.is_err() {
        sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
        let mut bots = sim.bots.lock().await;
        if bot_idx < bots.len() {
            bots[bot_idx].status = "error".to_string();
        }
        return;
    }
    if writer.flush().await.is_err() {
        sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
        let mut bots = sim.bots.lock().await;
        if bot_idx < bots.len() {
            bots[bot_idx].status = "error".to_string();
        }
        return;
    }

    // Читаем ответ на LOGIN
    let mut first_line = String::new();
    match reader.read_line(&mut first_line).await {
        Ok(0) | Err(_) => {
            sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
            let mut bots = sim.bots.lock().await;
            if bot_idx < bots.len() {
                bots[bot_idx].status = "error".to_string();
            }
            return;
        }
        _ => {}
    }

    let trimmed = first_line.trim();
    if !trimmed.starts_with("LOGIN_OK") {
        sim.failed_connections.fetch_add(1, AtomicOrdering::Relaxed);
        let mut bots = sim.bots.lock().await;
        if bot_idx < bots.len() {
            bots[bot_idx].status = "error".to_string();
        }
        return;
    }

    sim.total_connected.fetch_add(1, AtomicOrdering::Relaxed);
    sim.active_clients.fetch_add(1, AtomicOrdering::Relaxed);
    {
        let mut bots = sim.bots.lock().await;
        if bot_idx < bots.len() {
            bots[bot_idx].status = "active".to_string();
        }
    }

    // Фоновое чтение ответов
    let sim_read = sim.clone();
    let name_read = name.to_string();
    let read_cancel = sim.cancel.clone();
    let pending_sends = Arc::new(Mutex::new(VecDeque::<(String, Instant)>::new()));
    let pending_sends_read = pending_sends.clone();
    let read_handle = tokio::spawn(async move {
        loop {
            if read_cancel.load(AtomicOrdering::Relaxed) {
                break;
            }
            let mut line = String::new();
            match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => {
                    let l = line.trim();
                    if l.is_empty() {
                        continue;
                    }
                    // Парсим ответ
                    if let Some(pos) = l.find('|') {
                        let cmd = &l[..pos];
                        let payload = &l[pos + 1..];
                        if cmd == "MESSAGE" {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(payload) {
                                let sender = parsed
                                    .get("sender")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or_default();
                                let text = parsed
                                    .get("content")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or_default();

                                if sender == name_read {
                                    let pending = {
                                        let mut queue = pending_sends_read.lock().await;
                                        queue.pop_front()
                                    };

                                    if let Some((original_text, sent_at)) = pending {
                                        sim_read.messages_received.fetch_add(1, AtomicOrdering::Relaxed);

                                        let mut times = sim_read.response_times_ms.lock().await;
                                        times.push(sent_at.elapsed().as_secs_f64() * 1000.0);
                                        drop(times);

                                        let incorrect = if original_text.contains(MARKER) {
                                            !text.contains("Результат обработки после <@>:")
                                                || !text.contains(EXPECTED_PROCESSED)
                                        } else {
                                            text != original_text
                                        };

                                        if incorrect {
                                            sim_read.incorrect_responses.fetch_add(1, AtomicOrdering::Relaxed);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Отправка сообщений
    let messages = [
        format!("Обычное сообщение 1 от {}", name),
        format!("Проверка <@> {} {} {} {} {}", PALINDROME_WORDS[0], PALINDROME_WORDS[1], PALINDROME_WORDS[2], PALINDROME_WORDS[3], NON_PALINDROME),
        format!("Обычное сообщение 2 от {}", name),
        format!("Тест <@> {} {}", PALINDROME_WORDS[0], NON_PALINDROME),
        format!("Обычное сообщение 3 от {}", name),
    ];

    for (msg_idx, msg) in messages.iter().enumerate() {
        if sim.cancel.load(AtomicOrdering::Relaxed) {
            break;
        }

        let packet = format!("MESSAGE|{}\n", msg);
        if writer.write_all(packet.as_bytes()).await.is_err() {
            break;
        }
        if writer.flush().await.is_err() {
            break;
        }

        {
            let mut queue = pending_sends.lock().await;
            queue.push_back((msg.clone(), Instant::now()));
        }

        sim.messages_sent.fetch_add(1, AtomicOrdering::Relaxed);
        {
            let mut bots = sim.bots.lock().await;
            if bot_idx < bots.len() {
                bots[bot_idx].messages_sent = (msg_idx + 1) as u32;
            }
        }

        let delay = Duration::from_millis(100 + (msg_idx as u64 * 100));
        tokio::time::sleep(delay).await;
    }

    // QUIT
    let _ = writer.write_all(b"QUIT|\n").await;
    let _ = writer.flush().await;

    read_handle.abort();

    sim.active_clients.fetch_sub(1, AtomicOrdering::Relaxed);
    {
        let mut bots = sim.bots.lock().await;
        if bot_idx < bots.len() {
            bots[bot_idx].status = "done".to_string();
        }
    }
}
