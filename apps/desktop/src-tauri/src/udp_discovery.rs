//! UDP auto-discovery для TCP Messenger.
//!
//! Клиент отправляет broadcast-запрос в локальную сеть и получает
//! TCP-порт сервера из первого корректного ответа.

use serde::Serialize;
use tokio::net::UdpSocket;
use tokio::time::{timeout, Duration, Instant};

const DISCOVERY_PORT: u16 = 54545;
const DISCOVERY_REQUEST: &str = "TCP_MESSENGER_DISCOVER_V1";
const DISCOVERY_APP: &str = "tcp-messenger";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResult {
    pub host: String,
    pub port: u16,
}

fn parse_discovery_response(payload: &str, fallback_host: &str) -> Option<DiscoveryResult> {
    let parsed = serde_json::from_str::<serde_json::Value>(payload).ok()?;
    let app = parsed.get("app")?.as_str()?;
    if app != DISCOVERY_APP {
        return None;
    }

    let port = parsed.get("tcp_port")?.as_u64()?;
    if !(1..=u16::MAX as u64).contains(&port) {
        return None;
    }

    Some(DiscoveryResult {
        host: fallback_host.to_string(),
        port: port as u16,
    })
}

pub async fn discover_server(timeout_ms: u64) -> Result<Option<DiscoveryResult>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("Не удалось открыть UDP-сокет discovery: {}", e))?;

    socket
        .set_broadcast(true)
        .map_err(|e| format!("Не удалось включить UDP broadcast: {}", e))?;

    let targets = [
        format!("255.255.255.255:{}", DISCOVERY_PORT),
        format!("127.0.0.1:{}", DISCOVERY_PORT),
    ];

    for target in targets {
        let _ = socket.send_to(DISCOVERY_REQUEST.as_bytes(), &target).await;
    }

    let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(200));
    let mut buffer = [0_u8; 1024];

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Ok(None);
        }

        let recv_result = timeout(remaining, socket.recv_from(&mut buffer)).await;
        let (received, address) = match recv_result {
            Ok(Ok(value)) => value,
            Ok(Err(e)) => return Err(format!("Ошибка чтения UDP discovery: {}", e)),
            Err(_) => return Ok(None),
        };

        let payload = match std::str::from_utf8(&buffer[..received]) {
            Ok(text) => text.trim(),
            Err(_) => continue,
        };

        if let Some(discovered) = parse_discovery_response(payload, &address.ip().to_string()) {
            return Ok(Some(discovered));
        }
    }
}
