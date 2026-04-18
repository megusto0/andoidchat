"""
Асинхронный TCP-сервер мессенджера.

Полностью переписанная версия синхронного сервера (server.py) на базе asyncio.
Использует корутины вместо потоков, что позволяет масштабироваться
на десятки и сотни одновременных подключений.

Протокол совместим с существующим CLI-клиентом (client.py).
Запуск: python server_async.py <порт>
"""

import asyncio
import json
import signal
import sys
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
import time

MARKER = "<@>"

MAX_MESSAGES_PER_SECOND = 20
RATE_LIMIT_WINDOW = 1.0
HISTORY_LIMIT_PER_CHAT = 200
KNOWN_CLIENT_PLATFORMS = {"desktop", "android"}
DISCOVERY_PORT = 54545
DISCOVERY_REQUEST = "TCP_MESSENGER_DISCOVER_V1"
DISCOVERY_APP = "tcp-messenger"
GENERAL_CHAT_ID = "chat:general"
SIMULATION_DEFAULT_CLIENTS = 55
SIMULATION_BOT_PREFIX = "__sim_cli_bot__"
SIM_BOT_CONNECT_STAGGER_MS = 20
SIMULATION_WINDOW_SECS = 12
SIM_POST_CONNECT_SETTLE_MS = 450
SIM_MESSAGE_INTERVAL_BASE_MS = 650
SIM_MESSAGE_INTERVAL_STEP_MS = 45
SIM_SHUTDOWN_DRAIN_TIMEOUT_MS = 1400
SIM_SHUTDOWN_DRAIN_POLL_MS = 70
SIM_METRICS_INTERVAL_MS = 250
SIMULATION_LOCAL_HOST = "127.0.0.1"
PALINDROME_WORDS = ("Anna", "шалаш", "madam", "radar")
NON_PALINDROME = "test"


def log(*args):
    """
    Выводит служебную информацию с временной меткой.

    Формат: [HH:MM:SS] текст
    """
    timestamp = datetime.now().strftime("%H:%M:%S")
    print("[" + timestamp + "]", *args)


def encode_text(text):
    """
    Экранирует спецсимволы для передачи в одной строке протокола.

    Реальный обратный слеш заменяется на '\\\\',
    реальный перевод строки — на '\\n'.
    """
    return text.replace("\\", "\\\\").replace("\n", "\\n")


def is_palindrome(word):
    """
    Проверяет, является ли слово палиндромом без учёта регистра.
    """
    lowered = word.lower()
    return lowered == lowered[::-1]


def transform_word(word):
    """
    Обрабатывает одно слово по варианту 16.

    Если «ядро» слова (буквенно-цифровые символы без краевой пунктуации)
    является палиндромом — переводит его в верхний регистр.
    Пунктуация по краям сохраняется.
    """
    start = 0
    end = len(word) - 1

    while start <= end and not word[start].isalnum():
        start += 1

    while end >= start and not word[end].isalnum():
        end -= 1

    if start > end:
        return word

    prefix = word[:start]
    core = word[start:end + 1]
    suffix = word[end + 1:]

    if is_palindrome(core):
        core = core.upper()

    return prefix + core + suffix


def transform_text(text):
    """
    Разбивает текст на слова и обрабатывает каждое по варианту 16.
    """
    words = text.split()
    if not words:
        return ""
    return " ".join(transform_word(w) for w in words)


def build_response_text(message):
    """
    Формирует текст ответа сервера на сообщение клиента.

    Без маркера <@> — простое эхо.
    С маркером — двухстрочный ответ: исходное сообщение и результат обработки.
    """
    marker_index = message.find(MARKER)

    if marker_index == -1:
        return message

    text_after = message[marker_index + len(MARKER):].strip()
    lines = ["Исходное сообщение: " + message]

    if text_after == "":
        lines.append("После маркера <@> нет текста для обработки.")
        return "\n".join(lines)

    lines.append("Результат обработки после <@>: " + transform_text(text_after))
    return "\n".join(lines)


def build_simulation_message(name, sequence):
    """
    Формирует сообщение бота симуляции по шаблону, близкому к desktop-симулятору.
    """
    variant = sequence % 5
    if variant == 0:
        return f"Обычное сообщение {sequence + 1} от {name}"
    if variant == 1:
        return (
            f"Проверка <@> {PALINDROME_WORDS[0]} {PALINDROME_WORDS[1]} "
            f"{PALINDROME_WORDS[2]} {PALINDROME_WORDS[3]} {NON_PALINDROME} #{sequence + 1}"
        )
    if variant == 2:
        return f"Нагрузка от {name} — сообщение {sequence + 1}"
    if variant == 3:
        return f"Тест <@> {PALINDROME_WORDS[0]} {NON_PALINDROME} {sequence + 1}"
    return f"Стабильный поток от {name} #{sequence + 1}"


def parse_simulation_payload(payload):
    """
    Разбирает команду симуляции.

    Поддерживает:
    - SIMULATE|
    - SIMULATE|55
    - SIMULATE|visible 55
    - SIMULATE|benchmark 55
    - legacy aliases: observe/load
    - SIMULATE|{"mode":"visible","count":55}
    - SIMULATE|stop
    """
    raw = payload.strip()

    if raw == "":
        return True, "start", "visible", SIMULATION_DEFAULT_CLIENTS

    if raw.lower() == "stop":
        return True, "stop", "visible", 0

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parts = raw.split()
        if len(parts) == 1:
            parsed = {"mode": "visible", "count": parts[0]}
        elif len(parts) == 2:
            parsed = {"mode": parts[0], "count": parts[1]}
        else:
            parsed = raw

    if isinstance(parsed, dict):
        if str(parsed.get("action", "")).lower() == "stop":
            return True, "stop", "visible", 0
        mode = str(parsed.get("mode", "visible")).strip().lower() or "visible"
        count = parsed.get("count", SIMULATION_DEFAULT_CLIENTS)
    else:
        mode = "visible"
        count = parsed

    if mode == "observe":
        mode = "visible"
    elif mode == "load":
        mode = "benchmark"

    if mode not in {"visible", "benchmark"}:
        return False, "Укажите режим visible или benchmark.", "visible", 0

    try:
        count = int(count)
    except (TypeError, ValueError):
        return False, "Укажите количество ботов положительным целым числом.", mode, 0

    if count < 1:
        return False, "Количество ботов должно быть больше нуля.", mode, 0

    return True, "start", mode, count


def percentile(values, ratio):
    """
    Возвращает percentile для отсортированного списка чисел.
    """
    if not values:
        return 0.0

    index = round((len(values) - 1) * ratio)
    index = max(0, min(len(values) - 1, index))
    return values[index]


def parse_command(line):
    """
    Разбирает строку протокола на команду и полезную нагрузку.
    """
    if "|" in line:
        command, payload = line.split("|", 1)
    else:
        command = line
        payload = ""
    return command.strip().upper(), payload


def validate_client_name(name):
    """
    Проверяет корректность имени клиента.

    Запрещены пустое имя и символы-разделители протокола ('|', ',').
    """
    cleaned = name.strip()
    if cleaned == "":
        return False, "Имя клиента не должно быть пустым."
    if "|" in cleaned or "," in cleaned:
        return False, "Имя клиента не должно содержать символы '|' и ','."
    return True, cleaned


def normalize_client_platform(raw_platform):
    """
    Приводит платформу клиента к известному значению протокола.
    """
    if isinstance(raw_platform, str):
        cleaned = raw_platform.strip().lower()
        if cleaned in KNOWN_CLIENT_PLATFORMS:
            return cleaned
    return "desktop"


def parse_login_payload(payload):
    """
    Разбирает LOGIN payload.

    Поддерживает два формата:
    - legacy: LOGIN|Ivan
    - JSON:   LOGIN|{"name":"Ivan","platform":"android"}
    """
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        is_valid, result = validate_client_name(payload)
        return is_valid, result, "desktop"

    if not isinstance(parsed, dict):
        return False, "Некорректный формат LOGIN-пакета.", "desktop"

    raw_name = parsed.get("name")
    if not isinstance(raw_name, str):
        return False, "Имя клиента не должно быть пустым.", "desktop"

    is_valid, result = validate_client_name(raw_name)
    if not is_valid:
        return False, result, "desktop"

    return True, result, normalize_client_platform(parsed.get("platform"))


def parse_group_names(group_text, current_name, available_names):
    """
    Разбирает строку имён группы, убирая дубликаты и само имя клиента.

    Имена, отсутствующие среди подключённых, игнорируются.
    """
    selected = []
    seen = set()
    for raw_name in group_text.split(","):
        cleaned = raw_name.strip()
        if cleaned == "" or cleaned == current_name:
            continue
        if cleaned not in available_names or cleaned in seen:
            continue
        selected.append(cleaned)
        seen.add(cleaned)
    return selected


def build_discovery_response(tcp_port):
    """
    Формирует ответ на UDP discovery-запрос.
    """
    return json.dumps(
        {
            "app": DISCOVERY_APP,
            "tcp_port": tcp_port,
            "name": "TCP Messenger",
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


def parse_message_payload(payload, sender_name, available_names, default_targets):
    """
    Разбирает MESSAGE payload.

    Поддерживает два формата:
    - legacy: обычный текст сообщения;
    - JSON: {"targets": ["Alice"], "content": "Привет"}.
    """
    inferred_mode = "all" if default_targets is None else (
        "none" if len(default_targets) == 0 else "custom"
    )

    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return payload, inferred_mode, default_targets

    if not isinstance(parsed, dict):
        return payload, inferred_mode, default_targets

    content = parsed.get("content")
    if not isinstance(content, str):
        return payload, inferred_mode, default_targets

    mode = parsed.get("mode")
    if mode not in {"all", "none", "custom"}:
        mode = inferred_mode

    raw_targets = parsed.get("targets")
    if raw_targets is None:
        if mode == "all":
            return content, "all", None
        if mode == "none":
            return content, "none", []
        return content, "custom", default_targets

    if not isinstance(raw_targets, list):
        return content, mode, default_targets

    targets = []
    seen = set()

    for raw_name in raw_targets:
        if not isinstance(raw_name, str):
            continue

        cleaned = raw_name.strip()
        if cleaned == "" or cleaned == sender_name:
            continue
        if cleaned not in available_names or cleaned in seen:
            continue

        targets.append(cleaned)
        seen.add(cleaned)

    if mode == "all":
        return content, "all", None
    if mode == "none":
        return content, "none", []
    return content, "custom", targets


@dataclass
class ClientInfo:
    """Запись с данными подключённого клиента."""
    name: str
    reader: asyncio.StreamReader
    writer: asyncio.StreamWriter
    address: tuple
    platform: str = "desktop"
    group_mode: str = "all"
    group: set = field(default_factory=set)
    message_times: deque = field(default_factory=deque)
    ephemeral: bool = False


@dataclass
class StoredMessage:
    chat_id: str
    sender: str
    content: str
    mode: str
    targets: list[str]
    timestamp: int

    def as_payload(self):
        return {
            "sender": self.sender,
            "content": self.content,
            "mode": self.mode,
            "targets": self.targets,
            "timestamp": self.timestamp,
        }


@dataclass
class SimBotStatus:
    name: str
    status: str = "connecting"
    messages_sent: int = 0

    def as_payload(self):
        return {
            "name": self.name,
            "status": self.status,
            "messagesSent": self.messages_sent,
        }


@dataclass
class SimMetrics:
    requested_clients: int
    mode: str
    bot_statuses: list[SimBotStatus] = field(default_factory=list)
    active_clients: int = 0
    total_connected: int = 0
    failed_connections: int = 0
    messages_sent: int = 0
    messages_received: int = 0
    watcher_deliveries: int = 0
    echo_confirmed: int = 0
    server_responses_confirmed: int = 0
    incorrect_responses: int = 0
    response_times_ms: list[float] = field(default_factory=list)

    def as_payload(self, phase, elapsed_seconds):
        sorted_times = sorted(self.response_times_ms)
        avg_response_ms = (
            sum(sorted_times) / len(sorted_times)
            if sorted_times
            else 0.0
        )
        delivered_packets = self.messages_received + self.watcher_deliveries
        messages_per_second = (
            delivered_packets / elapsed_seconds
            if elapsed_seconds > 0
            else 0.0
        )
        return {
            "requestedClients": self.requested_clients,
            "mode": self.mode,
            "activeClients": self.active_clients,
            "totalConnected": self.total_connected,
            "failedConnections": self.failed_connections,
            "messagesSent": self.messages_sent,
            "messagesReceived": self.messages_received,
            "watcherDeliveries": self.watcher_deliveries,
            "echoConfirmed": self.echo_confirmed,
            "serverResponsesConfirmed": self.server_responses_confirmed,
            "incorrectResponses": self.incorrect_responses,
            "avgResponseMs": round(avg_response_ms, 2),
            "p50ResponseMs": round(percentile(sorted_times, 0.50), 2),
            "p95ResponseMs": round(percentile(sorted_times, 0.95), 2),
            "messagesPerSecond": round(messages_per_second, 2),
            "elapsedSeconds": round(elapsed_seconds, 2),
            "phase": phase,
            "botStatuses": [
                bot.as_payload() for bot in self.bot_statuses
            ] if self.mode == "visible" else [],
            "passed": (
                phase == "done"
                and self.total_connected >= self.requested_clients
                and self.failed_connections == 0
                and self.incorrect_responses == 0
            ),
        }


class AsyncServer:
    """Асинхронный сервер мессенджера."""

    def __init__(self, port: int):
        self.port = port
        self.clients: dict[str, ClientInfo] = {}
        self.known_users: set[str] = set()
        self.user_chats: dict[str, set[str]] = {}
        self.chat_history: dict[str, list[StoredMessage]] = {}
        self.server: asyncio.Server | None = None
        self._shutdown_event = asyncio.Event()
        self._discovery_transport = None
        self._simulation_task: asyncio.Task | None = None
        self._simulation_cancel: asyncio.Event | None = None
        self._simulation_context: dict | None = None

    def _create_discovery_protocol(self):
        response = build_discovery_response(self.port)

        class DiscoveryProtocol(asyncio.DatagramProtocol):
            def __init__(self):
                self.transport = None

            def connection_made(self, transport):
                self.transport = transport

            def datagram_received(self, data, addr):
                try:
                    text = data.decode("utf-8").strip()
                except UnicodeDecodeError:
                    return

                if text != DISCOVERY_REQUEST or self.transport is None:
                    return

                self.transport.sendto(response, addr)

        return DiscoveryProtocol()

    def _visible_client_names(self):
        return sorted(
            name
            for name, client in self.clients.items()
            if not client.ephemeral
        )

    def _simulation_watchers(self, desktop_only: bool = False):
        watchers = [
            client
            for client in self.clients.values()
            if not client.ephemeral
        ]
        if desktop_only:
            watchers = [client for client in watchers if client.platform == "desktop"]
        return watchers

    async def _send_line(self, client: ClientInfo, text: str) -> bool:
        """
        Отправляет одну строку клиенту.

        Возвращает True при успехе, False при ошибке.
        """
        try:
            client.writer.write((text + "\n").encode("utf-8"))
            await client.writer.drain()
            return True
        except OSError:
            return False

    async def _send_info(self, client: ClientInfo, text: str) -> bool:
        """Отправляет информационное сообщение."""
        return await self._send_line(client, "INFO|" + encode_text(text))

    async def _send_error(self, client: ClientInfo, text: str) -> bool:
        """Отправляет сообщение об ошибке."""
        return await self._send_line(client, "ERROR|" + encode_text(text))

    async def _send_chat(
        self,
        client: ClientInfo,
        sender_name: str,
        text: str,
        mode: str,
        targets: list[str],
        timestamp: int,
    ) -> bool:
        """Отправляет сообщение чата вместе с метаданными маршрутизации."""
        packet = json.dumps(
            {
                "sender": sender_name,
                "content": text,
                "mode": mode,
                "targets": targets,
                "timestamp": timestamp,
            },
            ensure_ascii=False,
        )
        return await self._send_line(client, "MESSAGE|" + packet)

    def _remember_user(self, name: str, platform: str | None = None):
        self.known_users.add(name)
        self.user_chats.setdefault(name, set())

    def _build_chat_members(
        self,
        sender_name: str,
        mode: str,
        targets: list[str] | None,
    ) -> tuple[str, set[str]]:
        normalized_targets = targets or []

        if mode == "all":
            members = set(self.known_users)
            members.add(sender_name)
            return GENERAL_CHAT_ID, members

        if mode == "none" or not normalized_targets:
            return f"chat:self:{sender_name}", {sender_name}

        members = {sender_name, *normalized_targets}
        chat_id = "chat:group:" + "|".join(sorted(members))
        return chat_id, members

    def _store_message(
        self,
        sender_name: str,
        message: str,
        mode: str,
        targets: list[str] | None = None,
    ) -> StoredMessage:
        normalized_targets = [] if mode != "custom" else sorted(targets or [])
        chat_id, members = self._build_chat_members(sender_name, mode, normalized_targets)
        stored = StoredMessage(
            chat_id=chat_id,
            sender=sender_name,
            content=message,
            mode=mode,
            targets=normalized_targets,
            timestamp=int(datetime.now().timestamp() * 1000),
        )
        history = self.chat_history.setdefault(chat_id, [])
        history.append(stored)
        if len(history) > HISTORY_LIMIT_PER_CHAT:
            del history[:len(history) - HISTORY_LIMIT_PER_CHAT]

        for member in members:
            self._remember_user(member)
            self.user_chats.setdefault(member, set()).add(chat_id)

        return stored

    def _store_server_response(
        self,
        original_chat_id: str,
        response_text: str,
        mode: str,
        targets: list[str],
        original_sender: str,
    ) -> StoredMessage:
        if mode == "all":
            server_targets = []
        elif mode == "none":
            server_targets = [original_sender]
        else:
            server_targets = sorted(set((targets or []) + [original_sender]))
        stored = StoredMessage(
            chat_id=original_chat_id,
            sender="Server",
            content=response_text,
            mode=mode,
            targets=server_targets,
            timestamp=int(datetime.now().timestamp() * 1000) + 1,
        )
        history = self.chat_history.setdefault(original_chat_id, [])
        history.append(stored)
        if len(history) > HISTORY_LIMIT_PER_CHAT:
            del history[:len(history) - HISTORY_LIMIT_PER_CHAT]
        return stored

    async def _send_sync_history(self, client: ClientInfo):
        chat_ids = self.user_chats.get(client.name, set())
        messages: list[StoredMessage] = []
        for chat_id in chat_ids:
            messages.extend(self.chat_history.get(chat_id, []))

        messages.sort(key=lambda item: item.timestamp)
        payload = json.dumps(
            {
                "messages": [message.as_payload() for message in messages],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        await self._send_line(client, "SYNC_HISTORY|" + payload)

    async def _send_simulation_result(self, client: ClientInfo, payload: dict):
        """
        Отправляет итоговые метрики симуляции клиенту-инициатору.
        """
        await self._send_line(
            client,
            "SIMULATION_RESULT|" + json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )

    async def _send_simulation_metrics(self, client: ClientInfo, payload: dict):
        """
        Отправляет live-снимок метрик симуляции клиенту-инициатору.
        """
        await self._send_line(
            client,
            "SIMULATION_METRICS|" + json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )

    async def _broadcast_info_to_watchers(
        self,
        text: str,
        excluded_names: set | None = None,
    ):
        excluded = excluded_names or set()
        watchers = [
            client
            for client in self._simulation_watchers(desktop_only=False)
            if client.name not in excluded
        ]
        if not watchers:
            return
        await asyncio.gather(
            *[self._send_info(client, text) for client in watchers],
            return_exceptions=True,
        )

    async def _broadcast_simulation_metrics_to_watchers(self, payload: dict):
        watchers = self._simulation_watchers(desktop_only=True)
        if not watchers:
            return
        await asyncio.gather(
            *[self._send_simulation_metrics(client, payload) for client in watchers],
            return_exceptions=True,
        )

    async def _broadcast_simulation_result_to_watchers(self, payload: dict):
        watchers = self._simulation_watchers(desktop_only=True)
        if not watchers:
            return
        await asyncio.gather(
            *[self._send_simulation_result(client, payload) for client in watchers],
            return_exceptions=True,
        )

    async def _send_simulation_event(self, client: ClientInfo, payload: dict):
        """
        Отправляет одно наблюдаемое событие симуляции клиенту-инициатору.
        """
        await self._send_line(
            client,
            "SIMULATION_EVENT|" + json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )

    async def _emit_simulation_event(self, requester_name: str, mode: str, payload: dict):
        """
        Legacy helper; kept for compatibility if simulation events return later.
        """
        if mode != "visible":
            return
        requester = self.clients.get(requester_name)
        if requester is None:
            return
        await self._send_simulation_event(requester, payload)

    async def _mirror_simulation_message(
        self,
        sender_name: str,
        text: str,
        timestamp: int,
    ) -> bool:
        context = self._simulation_context
        if context is None or context.get("mode") != "visible":
            return False

        simulation_id = context.get("simulation_id")
        metrics = context.get("metrics")
        if not isinstance(simulation_id, str):
            return False

        watchers = self._simulation_watchers(desktop_only=False)
        if not watchers:
            return False

        packet = json.dumps(
            {
                "sender": sender_name,
                "content": text,
                "mode": "all",
                "targets": [],
                "timestamp": timestamp,
                "simulationId": simulation_id,
                "simulationMode": "visible",
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        results = await asyncio.gather(
            *[self._send_line(watcher, "MESSAGE|" + packet) for watcher in watchers],
            return_exceptions=True,
        )
        delivered_count = sum(1 for result in results if result is True)
        if delivered_count > 0 and isinstance(metrics, SimMetrics):
            metrics.watcher_deliveries += delivered_count
        return delivered_count > 0

    def _simulation_phase(self, metrics: SimMetrics) -> str:
        active = sum(1 for bot in metrics.bot_statuses if bot.status == "active")
        connecting = sum(1 for bot in metrics.bot_statuses if bot.status == "connecting")
        errored = sum(1 for bot in metrics.bot_statuses if bot.status == "error")
        done = sum(1 for bot in metrics.bot_statuses if bot.status == "done")

        if active > 0:
            return "messaging"
        if connecting > 0 and done == 0 and errored == 0:
            return "connecting"
        if done + errored == len(metrics.bot_statuses):
            return "done"
        return "disconnecting"

    def _update_sim_bot(
        self,
        metrics: SimMetrics,
        bot_idx: int,
        status: str | None = None,
        messages_sent: int | None = None,
    ):
        if bot_idx < 0 or bot_idx >= len(metrics.bot_statuses):
            return
        bot = metrics.bot_statuses[bot_idx]
        if status is not None:
            bot.status = status
        if messages_sent is not None:
            bot.messages_sent = messages_sent

    def _check_rate_limit(self, client: ClientInfo) -> bool:
        """
        Проверяет ограничение частоты сообщений (rate limiter).

        Скользящее окно: не более MAX_MESSAGES_PER_SECOND за последнюю секунду.
        Возвращает True, если лимит превышен.
        """
        now = asyncio.get_event_loop().time()
        times = client.message_times

        while times and now - times[0] > RATE_LIMIT_WINDOW:
            times.popleft()

        if len(times) >= MAX_MESSAGES_PER_SECOND:
            return True

        times.append(now)
        return False

    async def _broadcast_client_list(self, excluded_names: set | None = None):
        """
        Рассылает обновлённый список клиентов всем подключённым.
        """
        excluded = excluded_names or set()
        names = self._visible_client_names()
        packet = "CLIENTS|" + ",".join(names)
        meta_packet = "CLIENTS_META|" + json.dumps(
            {name: self.clients[name].platform for name in names},
            ensure_ascii=False,
            separators=(",", ":"),
        )

        recipients = [
            c for c in self.clients.values()
            if c.name not in excluded and not c.ephemeral
        ]

        async def _send_one(c: ClientInfo):
            try:
                c.writer.write((packet + "\n").encode("utf-8"))
                c.writer.write((meta_packet + "\n").encode("utf-8"))
                await c.writer.drain()
            except OSError:
                pass

        if recipients:
            await asyncio.gather(*[_send_one(c) for c in recipients], return_exceptions=True)

    async def _deliver_message(
        self,
        stored_message: StoredMessage,
    ):
        """
        Формирует ответ и рассылает его адресатам сообщения.
        """
        if stored_message.mode == "all":
            recipients = list(self.clients.values())
        else:
            recipient_names = {stored_message.sender, *stored_message.targets}
            recipients = [
                client
                for name, client in self.clients.items()
                if name in recipient_names
            ]

        async def _send_one(c: ClientInfo):
            await self._send_chat(
                c,
                stored_message.sender,
                stored_message.content,
                stored_message.mode,
                stored_message.targets,
                stored_message.timestamp,
            )

        await asyncio.gather(*[_send_one(c) for c in recipients], return_exceptions=True)

    async def _update_group(self, client: ClientInfo, payload: str):
        """
        Обновляет группу адресатов по умолчанию для legacy MESSAGE-команд.
        """
        group_text = payload.strip()
        all_names = set(self.known_users)

        if group_text.lower() == "all":
            client.group_mode = "all"
            client.group = set()
            return

        selected = parse_group_names(group_text, client.name, all_names)
        client.group_mode = "custom"
        client.group = set(selected)

    def _cleanup_simulation_users(self, bot_names):
        """
        Удаляет временных пользователей симуляции из known_users/history.
        """
        chat_ids = set()
        for bot_name in bot_names:
            self.known_users.discard(bot_name)
            chat_ids.update(self.user_chats.pop(bot_name, set()))

        for chat_id in chat_ids:
            self.chat_history.pop(chat_id, None)

    async def _run_simulation_reader(
        self,
        reader,
        bot_name,
        pending_echoes,
        pending_server,
        metrics,
        cancel_event,
    ):
        while not cancel_event.is_set():
            try:
                line = await reader.readline()
            except OSError:
                break

            if not line:
                break

            trimmed = line.decode("utf-8").strip()
            if trimmed == "":
                continue

            command, payload = parse_command(trimmed)
            if command != "MESSAGE":
                continue

            try:
                parsed = json.loads(payload)
            except json.JSONDecodeError:
                continue

            if not isinstance(parsed, dict):
                continue

            sender = parsed.get("sender")
            text = parsed.get("content")
            if not isinstance(sender, str) or not isinstance(text, str):
                continue

            metrics.messages_received += 1

            if sender == bot_name:
                if pending_echoes:
                    expected_text, sent_at = pending_echoes.popleft()
                    if expected_text == text:
                        metrics.echo_confirmed += 1
                        metrics.response_times_ms.append(
                            (time.monotonic() - sent_at) * 1000.0
                        )
                    else:
                        metrics.incorrect_responses += 1
                continue

            if sender == "Server":
                for index, (expected_text, sent_at) in enumerate(pending_server):
                    if build_response_text(expected_text) == text:
                        metrics.server_responses_confirmed += 1
                        metrics.response_times_ms.append(
                            (time.monotonic() - sent_at) * 1000.0
                        )
                        del pending_server[index]
                        break
                # Бот в custom-группе получает server-response не только на свои
                # сообщения, но и на сообщения остальных участников. Такие
                # пакеты не должны считаться ошибкой проверки.
                continue

    async def _run_simulation_bot(
        self,
        bot_idx,
        bot_name,
        target_names,
        metrics,
        start_event,
        cancel_event,
        active_until,
    ):
        connected = False
        writer = None
        read_task = None
        pending_echoes = deque()
        pending_server = deque()

        try:
            reader, writer = await asyncio.open_connection(
                SIMULATION_LOCAL_HOST,
                self.port,
            )

            login_payload = json.dumps(
                {
                    "name": bot_name,
                    "platform": "desktop",
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
            writer.write((f"LOGIN|{login_payload}\n").encode("utf-8"))
            await writer.drain()

            first_line = await reader.readline()
            if not first_line:
                metrics.failed_connections += 1
                return

            command, _ = parse_command(first_line.decode("utf-8").rstrip("\n"))
            if command != "LOGIN_OK":
                metrics.failed_connections += 1
                self._update_sim_bot(metrics, bot_idx, status="error")
                return

            connected = True
            metrics.total_connected += 1
            metrics.active_clients += 1
            self._update_sim_bot(metrics, bot_idx, status="active", messages_sent=0)

            read_task = asyncio.create_task(
                self._run_simulation_reader(
                    reader,
                    bot_name,
                    pending_echoes,
                    pending_server,
                    metrics,
                    cancel_event,
                )
            )

            await start_event.wait()

            sequence = 0
            while not cancel_event.is_set() and time.monotonic() < active_until:
                text = build_simulation_message(bot_name, sequence)
                packet = json.dumps(
                    {
                        "mode": "custom",
                        "targets": target_names,
                        "content": text,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                writer.write((f"MESSAGE|{packet}\n").encode("utf-8"))
                await writer.drain()

                sent_at = time.monotonic()
                pending_echoes.append((text, sent_at))
                if MARKER in text:
                    pending_server.append((text, sent_at))

                metrics.messages_sent += 1
                sequence += 1
                self._update_sim_bot(metrics, bot_idx, messages_sent=sequence)

                interval_ms = (
                    SIM_MESSAGE_INTERVAL_BASE_MS
                    + (bot_idx % 7) * SIM_MESSAGE_INTERVAL_STEP_MS
                )
                await asyncio.sleep(interval_ms / 1000.0)

            deadline = time.monotonic() + (SIM_SHUTDOWN_DRAIN_TIMEOUT_MS / 1000.0)
            while (
                (pending_echoes or pending_server)
                and not cancel_event.is_set()
                and time.monotonic() < deadline
            ):
                await asyncio.sleep(SIM_SHUTDOWN_DRAIN_POLL_MS / 1000.0)

            if pending_echoes or pending_server:
                metrics.incorrect_responses += len(pending_echoes) + len(pending_server)

            writer.write(b"QUIT|\n")
            await writer.drain()
        except OSError:
            if not connected:
                metrics.failed_connections += 1
                self._update_sim_bot(metrics, bot_idx, status="error")
            elif pending_echoes or pending_server:
                metrics.incorrect_responses += len(pending_echoes) + len(pending_server)
        finally:
            if connected:
                metrics.active_clients = max(0, metrics.active_clients - 1)
                final_status = "error" if pending_echoes or pending_server else "done"
                self._update_sim_bot(metrics, bot_idx, status=final_status)
            if read_task is not None:
                read_task.cancel()
                await asyncio.gather(read_task, return_exceptions=True)
            if writer is not None:
                try:
                    writer.close()
                    await writer.wait_closed()
                except OSError:
                    pass

    async def _run_cli_simulation(self, requester_name, mode, count, cancel_event):
        started_at = time.monotonic()
        simulation_id = f"sim:{int(started_at * 1000)}"
        metrics = SimMetrics(
            requested_clients=count,
            mode=mode,
            bot_statuses=[
                SimBotStatus(
                    name=f"{SIMULATION_BOT_PREFIX}{int(started_at * 1000)}_{index:03d}"
                )
                for index in range(1, count + 1)
            ],
        )
        bot_names = [bot.name for bot in metrics.bot_statuses]
        start_event = asyncio.Event()
        active_until = started_at + SIMULATION_WINDOW_SECS
        tasks = []
        metrics_task = None

        try:
            self._simulation_context = {
                "simulation_id": simulation_id,
                "mode": mode,
                "requester_name": requester_name,
                "metrics": metrics,
            }
            initial_payload = metrics.as_payload("connecting", 0.0)
            await self._broadcast_simulation_metrics_to_watchers(initial_payload)

            async def publish_metrics_loop():
                while not cancel_event.is_set():
                    await self._broadcast_simulation_metrics_to_watchers(
                        metrics.as_payload(
                            self._simulation_phase(metrics),
                            time.monotonic() - started_at,
                        ),
                    )
                    await asyncio.sleep(SIM_METRICS_INTERVAL_MS / 1000.0)

            metrics_task = asyncio.create_task(publish_metrics_loop())

            for index, bot_name in enumerate(bot_names):
                targets = [name for name in bot_names if name != bot_name]
                tasks.append(
                    asyncio.create_task(
                        self._run_simulation_bot(
                            index,
                            bot_name,
                            targets,
                            metrics,
                            start_event,
                            cancel_event,
                            active_until,
                        )
                    )
                )
                await asyncio.sleep(SIM_BOT_CONNECT_STAGGER_MS / 1000.0)

            await asyncio.sleep(SIM_POST_CONNECT_SETTLE_MS / 1000.0)
            start_event.set()
            await asyncio.gather(*tasks, return_exceptions=True)

            phase = "cancelled" if cancel_event.is_set() else "done"
            payload = metrics.as_payload(phase, time.monotonic() - started_at)
            requester = self.clients.get(requester_name)
            if requester is not None:
                await self._send_info(
                    requester,
                    f"Симуляция {mode} завершена. Итоговые метрики отправлены отдельным пакетом.",
                )
            await self._broadcast_simulation_metrics_to_watchers(payload)
            await self._broadcast_simulation_result_to_watchers(payload)
            await self._broadcast_info_to_watchers(
                (
                    f"Симуляция {mode}, запущенная {requester_name}, завершена: "
                    f"{'успешно' if payload.get('passed') else 'с ошибками'}."
                ),
                excluded_names={requester_name},
            )
        finally:
            start_event.set()
            if metrics_task is not None:
                metrics_task.cancel()
                await asyncio.gather(metrics_task, return_exceptions=True)
            self._cleanup_simulation_users(bot_names)
            if self._simulation_context is not None and self._simulation_context.get("simulation_id") == simulation_id:
                self._simulation_context = None
            current_task = asyncio.current_task()
            if self._simulation_task is current_task:
                self._simulation_task = None
                self._simulation_cancel = None

    async def _handle_simulation_command(self, client, payload):
        is_valid, action, mode, count = parse_simulation_payload(payload)

        if not is_valid:
            await self._send_error(client, action)
            return

        current_task = self._simulation_task
        if action == "stop":
            if current_task is None or current_task.done() or self._simulation_cancel is None:
                await self._send_error(client, "Симуляция сейчас не запущена.")
                return
            self._simulation_cancel.set()
            await self._send_info(client, "Симуляция останавливается…")
            return

        if current_task is not None and not current_task.done():
            await self._send_error(client, "Симуляция уже выполняется. Дождитесь завершения или отправьте /simulate stop.")
            return

        self._simulation_cancel = asyncio.Event()
        self._simulation_task = asyncio.create_task(
            self._run_cli_simulation(client.name, mode, count, self._simulation_cancel)
        )
        await self._send_info(
            client,
            f"Симуляция {mode} запущена: {count} ботов, окно {SIMULATION_WINDOW_SECS} сек.",
        )
        await self._broadcast_info_to_watchers(
            f"Симуляция {mode} запущена пользователем {client.name}: {count} ботов.",
            excluded_names={client.name},
        )

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """
        Обслуживает одно клиентское подключение от начала до конца.
        """
        address = writer.get_extra_info("peername")
        registered_name = None

        try:
            line_bytes = await reader.readline()
            if not line_bytes:
                writer.close()
                await writer.wait_closed()
                return

            line = line_bytes.decode("utf-8").rstrip("\n")
            command, payload = parse_command(line)

            if command != "LOGIN":
                raw_text = "ERROR|Сначала необходимо отправить имя клиента командой LOGIN|имя."
                writer.write((raw_text + "\n").encode("utf-8"))
                await writer.drain()
                writer.close()
                await writer.wait_closed()
                return

            is_valid, result, client_platform = parse_login_payload(payload)
            if not is_valid:
                writer.write(("ERROR|" + result + "\n").encode("utf-8"))
                await writer.drain()
                writer.close()
                await writer.wait_closed()
                return

            if result in self.clients:
                writer.write(
                    ("ERROR|Клиент с таким именем уже подключен. Выберите другое имя.\n").encode("utf-8")
                )
                await writer.drain()
                writer.close()
                await writer.wait_closed()
                return

            registered_name = result
            client = ClientInfo(
                name=registered_name,
                reader=reader,
                writer=writer,
                address=address,
                platform=client_platform,
                ephemeral=registered_name.startswith(SIMULATION_BOT_PREFIX),
            )
            self.clients[registered_name] = client
            self._remember_user(registered_name, client_platform)

            await self._send_line(client, "LOGIN_OK|" + registered_name)
            await self._send_sync_history(client)
            if not client.ephemeral:
                await self._broadcast_client_list()
            if not client.ephemeral:
                log("Подключился клиент:", registered_name, f"[{client_platform}]", address)

            while True:
                line_bytes = await reader.readline()
                if not line_bytes:
                    break

                line = line_bytes.decode("utf-8").rstrip("\n")
                command, payload = parse_command(line)

                if command == "MESSAGE":
                    if self._check_rate_limit(client):
                        await self._send_error(client, "Слишком много сообщений. Подождите.")
                        continue
                    default_targets = (
                        None if client.group_mode == "all" else sorted(client.group)
                    )
                    message_text, mode, targets = parse_message_payload(
                        payload,
                        registered_name,
                        set(self.known_users),
                        default_targets,
                    )

                    if message_text.strip() == "":
                        await self._send_error(client, "Пустое сообщение не отправлено.")
                        continue

                    if not client.ephemeral:
                        if mode == "all":
                            log("Сообщение от", registered_name + ":", message_text, "-> ALL")
                        else:
                            log(
                                "Сообщение от",
                                registered_name + ":",
                                message_text,
                                "->",
                                ",".join(targets) if targets else "(self)",
                            )

                    stored_message = self._store_message(
                        registered_name,
                        message_text,
                        mode,
                        targets,
                    )
                    await self._deliver_message(stored_message)
                    if client.ephemeral:
                        await self._mirror_simulation_message(
                            stored_message.sender,
                            stored_message.content,
                            stored_message.timestamp,
                        )

                    if MARKER in message_text:
                        response_text = build_response_text(message_text)
                        server_stored = self._store_server_response(
                            stored_message.chat_id,
                            response_text,
                            mode,
                            targets,
                            registered_name,
                        )
                        await self._deliver_message(server_stored)
                        if client.ephemeral:
                            await self._mirror_simulation_message(
                                server_stored.sender,
                                server_stored.content,
                                server_stored.timestamp,
                            )
                elif command == "GROUP":
                    await self._update_group(client, payload)
                elif command == "LIST":
                    names = self._visible_client_names()
                    await self._send_line(client, "CLIENTS|" + ",".join(names))
                    await self._send_line(
                        client,
                        "CLIENTS_META|" + json.dumps(
                            {name: self.clients[name].platform for name in names},
                            ensure_ascii=False,
                            separators=(",", ":"),
                        ),
                    )
                elif command == "SIMULATE":
                    await self._handle_simulation_command(client, payload)
                elif command == "QUIT":
                    break
                else:
                    await self._send_error(client, "Неизвестная команда клиента.")

        except (OSError, ConnectionResetError) as exc:
            log("Ошибка соединения с клиентом", address, ":", exc)
        finally:
            if registered_name:
                removed = self.clients.pop(registered_name, None)
                if removed:
                    if not removed.ephemeral:
                        log("Клиент отключился:", removed.name)
                    try:
                        removed.writer.close()
                        await removed.writer.wait_closed()
                    except OSError:
                        pass
                    if not removed.ephemeral:
                        await self._broadcast_client_list()
            else:
                try:
                    writer.close()
                    await writer.wait_closed()
                except OSError:
                    pass

    async def start(self):
        """
        Запускает сервер и настраивает обработку сигналов завершения.
        """
        try:
            self.server = await asyncio.start_server(
                self._handle_client, "", self.port, backlog=128
            )
        except OSError as exc:
            print(
                "Ошибка: не удалось запустить сервер на порту",
                self.port,
                ". Возможно, этот порт уже занят.",
            )
            print("Текст ошибки:", exc)
            return

        try:
            transport, _ = await asyncio.get_running_loop().create_datagram_endpoint(
                self._create_discovery_protocol,
                local_addr=("0.0.0.0", DISCOVERY_PORT),
                allow_broadcast=True,
            )
            self._discovery_transport = transport
        except OSError as exc:
            log("Предупреждение: UDP discovery недоступен:", exc)

        log("Сервер запущен.")
        log("Порт:", self.port)
        if self._discovery_transport is not None:
            log("UDP discovery:", DISCOVERY_PORT)
        log("Сервер поддерживает несколько клиентов одновременно.")
        log("CLI-симуляция: команда /simulate <count> из client.py")
        log("Для остановки сервера нажмите Ctrl+C.")
        log()

        loop = asyncio.get_running_loop()

        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._shutdown_event.set)

        await self._shutdown_event.wait()

        log()
        log("Сервер останавливается…")

        if self._simulation_cancel is not None:
            self._simulation_cancel.set()
        if self._simulation_task is not None:
            self._simulation_task.cancel()
            await asyncio.gather(self._simulation_task, return_exceptions=True)

        for client in list(self.clients.values()):
            try:
                client.writer.close()
                await client.writer.wait_closed()
            except OSError:
                pass
        self.clients.clear()

        self.server.close()
        await self.server.wait_closed()
        if self._discovery_transport is not None:
            self._discovery_transport.close()
            self._discovery_transport = None

        log("Сервер остановлен.")


def main():
    """
    Точка входа в программу сервера.
    """
    if len(sys.argv) != 2:
        print("Использование: python server_async.py <порт>")
        return

    try:
        port = int(sys.argv[1])
    except ValueError:
        print("Ошибка: номер порта должен быть целым числом.")
        return

    if port < 1 or port > 65535:
        print("Ошибка: номер порта должен быть в диапазоне от 1 до 65535.")
        return

    server = AsyncServer(port)
    asyncio.run(server.start())


if __name__ == "__main__":
    main()
