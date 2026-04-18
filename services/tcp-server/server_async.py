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

MARKER = "<@>"

MAX_MESSAGES_PER_SECOND = 20
HISTORY_LIMIT_PER_CHAT = 200
RATE_LIMIT_WINDOW = 1.0
KNOWN_CLIENT_PLATFORMS = {"desktop", "android"}
DISCOVERY_PORT = 54545
DISCOVERY_REQUEST = "TCP_MESSENGER_DISCOVER_V1"
DISCOVERY_APP = "tcp-messenger"
GENERAL_CHAT_ID = "chat:general"


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
        names = sorted(self.clients.keys())
        packet = "CLIENTS|" + ",".join(names)
        meta_packet = "CLIENTS_META|" + json.dumps(
            {name: self.clients[name].platform for name in names},
            ensure_ascii=False,
            separators=(",", ":"),
        )

        recipients = [
            c for c in self.clients.values()
            if c.name not in excluded
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
            )
            self.clients[registered_name] = client
            self._remember_user(registered_name, client_platform)

            await self._send_line(client, "LOGIN_OK|" + registered_name)
            await self._send_sync_history(client)
            await self._broadcast_client_list()
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
                elif command == "GROUP":
                    await self._update_group(client, payload)
                elif command == "LIST":
                    names = sorted(self.clients.keys())
                    await self._send_line(client, "CLIENTS|" + ",".join(names))
                    await self._send_line(
                        client,
                        "CLIENTS_META|" + json.dumps(
                            {name: self.clients[name].platform for name in names},
                            ensure_ascii=False,
                            separators=(",", ":"),
                        ),
                    )
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
                    log("Клиент отключился:", removed.name)
                    try:
                        removed.writer.close()
                        await removed.writer.wait_closed()
                    except OSError:
                        pass
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
        log("Для остановки сервера нажмите Ctrl+C.")
        log()

        loop = asyncio.get_running_loop()

        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._shutdown_event.set)

        await self._shutdown_event.wait()

        log()
        log("Сервер останавливается…")

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
