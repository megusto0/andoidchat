//! Парсинг и формирование пакетов текстового протокола мессенджера.
//!
//! Протокол: построчный UTF-8, разделитель `|` (первое вхождение).
//! Экранирование: реальный `\n` → `\\n`, реальный `\\` → `\\\\`.

use serde::Serialize;

/// Пакет, отправляемый из Rust в React через Tauri event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPacket {
    /// Команда: LOGIN_OK, INFO, ERROR, MESSAGE, CLIENTS
    pub command: String,
    /// Всё, что идёт после первого `|`
    pub payload: String,
}

/// Разбирает строку протокола на команду и полезную нагрузку.
///
/// Если `|` отсутствует — вся строка считается командой, payload пустой.
pub fn parse_packet(line: &str) -> ServerPacket {
    if let Some(pos) = line.find('|') {
        ServerPacket {
            command: line[..pos].trim().to_uppercase(),
            payload: line[pos + 1..].to_string(),
        }
    } else {
        ServerPacket {
            command: line.trim().to_uppercase(),
            payload: String::new(),
        }
    }
}

/// Формирует пакет LOGIN.
pub fn make_login(name: &str, platform: &str) -> String {
    let payload = serde_json::json!({
        "name": name,
        "platform": platform,
    });
    format!("LOGIN|{}", payload)
}

/// Формирует пакет MESSAGE.
#[allow(dead_code)]
pub fn make_message(text: &str) -> String {
    format!("MESSAGE|{}", text)
}

/// Формирует произвольную команду протокола (как есть).
#[allow(dead_code)]
pub fn make_raw(raw: &str) -> String {
    raw.to_string()
}

/// Экранирует спецсимволы для отправки в одной строке протокола.
///
/// `\` → `\\`, перевод строки → `\n`.
#[allow(dead_code)]
pub fn encode_text(text: &str) -> String {
    text.replace('\\', "\\\\").replace('\n', "\\n")
}
