//! UDP auto-discovery для TCP Messenger.
//!
//! Desktop-клиент ищет сервер так же агрессивно, как Android:
//! - global broadcast
//! - directed broadcast по локальным интерфейсам
//! - unicast fallback по адресам локальной подсети

use std::collections::BTreeSet;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use if_addrs::{IfAddr, get_if_addrs};
use serde::Serialize;
use tokio::net::UdpSocket;
use tokio::time::{Duration, Instant, timeout};

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

fn collect_discovery_targets() -> Vec<SocketAddr> {
    let mut targets = BTreeSet::new();

    targets.insert(SocketAddr::new(
        IpAddr::V4(Ipv4Addr::new(255, 255, 255, 255)),
        DISCOVERY_PORT,
    ));
    targets.insert(SocketAddr::new(
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        DISCOVERY_PORT,
    ));

    let interfaces = match get_if_addrs() {
        Ok(interfaces) => interfaces,
        Err(_) => return targets.into_iter().collect(),
    };

    for interface in interfaces {
        if should_skip_interface(&interface.name) || interface.is_loopback() {
            continue;
        }

        let IfAddr::V4(v4) = interface.addr else {
            continue;
        };

        let ip = v4.ip;
        let netmask = v4.netmask;

        if ip.is_loopback() || ip.is_link_local() || ip.octets() == [0, 0, 0, 0] {
            continue;
        }

        targets.insert(SocketAddr::new(IpAddr::V4(compute_broadcast(ip, netmask)), DISCOVERY_PORT));

        for host in subnet_hosts(ip, netmask) {
            targets.insert(SocketAddr::new(IpAddr::V4(host), DISCOVERY_PORT));
        }
    }

    targets.into_iter().collect()
}

fn should_skip_interface(name: &str) -> bool {
    let lowered = name.to_ascii_lowercase();
    lowered.starts_with("docker")
        || lowered.starts_with("br-")
        || lowered.starts_with("veth")
        || lowered.starts_with("virbr")
}

fn compute_broadcast(ip: Ipv4Addr, netmask: Ipv4Addr) -> Ipv4Addr {
    Ipv4Addr::from(u32::from(ip) | !u32::from(netmask))
}

fn subnet_hosts(ip: Ipv4Addr, netmask: Ipv4Addr) -> Vec<Ipv4Addr> {
    let prefix = u32::from(netmask).count_ones() as u8;
    let effective_prefix = match prefix {
        24..=30 => prefix,
        _ => 24,
    };

    let host_bits = 32_u32.saturating_sub(effective_prefix as u32);
    let host_count = ((1_u32 << host_bits).saturating_sub(2)).clamp(1, 254);
    let mask = if effective_prefix == 0 {
        0
    } else {
        u32::MAX << host_bits
    };

    let base = u32::from(ip) & mask;
    let current = u32::from(ip);
    let mut hosts = Vec::with_capacity(host_count as usize);

    for offset in 1..=host_count {
        let candidate = base + offset;
        if candidate == current {
            continue;
        }
        hosts.push(Ipv4Addr::from(candidate));
    }

    hosts
}

pub async fn discover_server(timeout_ms: u64) -> Result<Option<DiscoveryResult>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("Не удалось открыть UDP-сокет discovery: {}", e))?;

    socket
        .set_broadcast(true)
        .map_err(|e| format!("Не удалось включить UDP broadcast: {}", e))?;

    for target in collect_discovery_targets() {
        let _ = socket.send_to(DISCOVERY_REQUEST.as_bytes(), target).await;
    }

    let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(250));
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
