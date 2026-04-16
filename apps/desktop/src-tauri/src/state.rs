//! Глобальное состояние приложения Tauri.
//!
//! Хранит канал отправки в TCP-сокет и флаг подключения.
//! Доступно из всех Tauri-команд через `tauri::State`.

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::Mutex;
use tokio::sync::mpsc;

use crate::protocol::ServerPacket;
use crate::simulator::SimMetrics;

/// Общее состояние приложения.
///
/// - `sender` — канал для передачи строк в фоновую задачу записи в TCP.
///   `None`, если клиент не подключён.
/// - `connected` — атомарный флаг, `true` если есть активное TCP-соединение.
pub struct AppState {
    pub sender: Mutex<Option<mpsc::Sender<String>>>,
    pub connected: AtomicBool,
    pub latest_clients: Mutex<Vec<String>>,
    pub latest_client_platforms: Mutex<HashMap<String, String>>,
    pub packet_queue: Mutex<VecDeque<ServerPacket>>,
    pub simulation_cancel: Mutex<Option<Arc<AtomicBool>>>,
    pub latest_simulation_metrics: Mutex<SimMetrics>,
}

impl AppState {
    /// Создаёт начальное состояние (не подключено).
    pub fn new() -> Self {
        Self {
            sender: Mutex::new(None),
            connected: AtomicBool::new(false),
            latest_clients: Mutex::new(Vec::new()),
            latest_client_platforms: Mutex::new(HashMap::new()),
            packet_queue: Mutex::new(VecDeque::new()),
            simulation_cancel: Mutex::new(None),
            latest_simulation_metrics: Mutex::new(SimMetrics::default()),
        }
    }

    pub fn set_clients(&self, clients: Vec<String>) {
        *self.latest_clients.lock().unwrap() = clients;
    }

    pub fn get_clients(&self) -> Vec<String> {
        self.latest_clients.lock().unwrap().clone()
    }

    pub fn set_client_platforms(&self, platforms: HashMap<String, String>) {
        *self.latest_client_platforms.lock().unwrap() = platforms;
    }

    pub fn get_client_platforms(&self) -> HashMap<String, String> {
        self.latest_client_platforms.lock().unwrap().clone()
    }

    pub fn push_packet(&self, packet: ServerPacket) {
        let mut queue = self.packet_queue.lock().unwrap();
        queue.push_back(packet);
        if queue.len() > 512 {
            queue.pop_front();
        }
    }

    pub fn drain_packets(&self) -> Vec<ServerPacket> {
        self.packet_queue.lock().unwrap().drain(..).collect()
    }

    pub fn set_simulation_metrics(&self, metrics: SimMetrics) {
        *self.latest_simulation_metrics.lock().unwrap() = metrics;
    }

    pub fn get_simulation_metrics(&self) -> SimMetrics {
        self.latest_simulation_metrics.lock().unwrap().clone()
    }
}
