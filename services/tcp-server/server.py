import json
import socket
import sys
import threading
from datetime import datetime


# Маркер, после которого нужно обрабатывать текст по варианту 16.
MARKER = "<@>"
KNOWN_CLIENT_PLATFORMS = {"desktop", "android"}
DISCOVERY_PORT = 54545
DISCOVERY_REQUEST = "TCP_MESSENGER_DISCOVER_V1"
DISCOVERY_APP = "tcp-messenger"
GENERAL_CHAT_ID = "chat:general"

# Общий словарь подключенных клиентов.
# Ключ - имя клиента, значение - словарь с данными клиента.
clients = {}
known_users = set()
user_chats = {}
chat_history = {}

# Блокировка нужна, потому что сервер работает сразу с несколькими клиентами.
clients_lock = threading.RLock()

# Отдельная блокировка делает вывод сервера аккуратным даже при нескольких потоках.
log_lock = threading.Lock()


def show_usage():
    """
    Выводит краткую инструкцию по запуску сервера.
    """
    print("Использование: python server.py <порт>")


def log(*args):
    """
    Потокобезопасный вывод служебной информации сервера.
    """
    with log_lock:
        print(*args)


def is_palindrome(word):
    """
    Проверяет, является ли слово палиндромом без учета регистра.
    """
    lowered_word = word.lower()
    return lowered_word == lowered_word[::-1]


def encode_text(text):
    """
    Экранирует перевод строки внутри текстового пакета.

    Протокол остается строчным: один пакет передается одной строкой.
    Поэтому реальные символы перевода строки заменяются на служебную
    последовательность '\\n', а обратный слеш экранируется отдельно.
    """
    return text.replace("\\", "\\\\").replace("\n", "\\n")


def transform_word(word):
    """
    Обрабатывает одно слово.

    Если слово является палиндромом, переводит его в верхний регистр.
    Символы пунктуации по краям слова сохраняются.
    """
    start_index = 0
    end_index = len(word) - 1

    while start_index <= end_index and not word[start_index].isalnum():
        start_index += 1

    while end_index >= start_index and not word[end_index].isalnum():
        end_index -= 1

    if start_index > end_index:
        return word

    prefix = word[:start_index]
    core = word[start_index:end_index + 1]
    suffix = word[end_index + 1:]

    # Здесь реализован вариант 16:
    # если слово является палиндромом, переводим его в верхний регистр.
    if is_palindrome(core):
        core = core.upper()

    return prefix + core + suffix


def transform_text(text):
    """
    Разбивает текст на слова и обрабатывает каждое слово по варианту 16.
    """
    words = text.split()

    if not words:
        return ""

    transformed_words = []

    for word in words:
        transformed_words.append(transform_word(word))

    return " ".join(transformed_words)


def build_response_text(message):
    """
    Формирует один цельный ответ сервера на одно сообщение клиента.

    Если маркера <@> нет, сервер возвращает только исходное сообщение
    без лишних пояснений.

    Если маркер есть, сервер возвращает один многострочный блок:
    сначала исходное сообщение, затем результат обработки.
    """
    marker_index = message.find(MARKER)

    if marker_index == -1:
        return message

    text_after_marker = message[marker_index + len(MARKER):].strip()
    response_lines = ["Исходное сообщение: " + message]

    if text_after_marker == "":
        response_lines.append("После маркера <@> нет текста для обработки.")
        return "\n".join(response_lines)

    transformed_text = transform_text(text_after_marker)
    response_lines.append("Результат обработки после <@>: " + transformed_text)

    return "\n".join(response_lines)


def parse_command(line):
    """
    Разбирает строку протокола на команду и полезную нагрузку.

    Примеры:
    - LOGIN|Ivan
    - MESSAGE|Привет <@> Anna level
    - GROUP|all
    """
    if "|" in line:
        command, payload = line.split("|", 1)
    else:
        command = line
        payload = ""

    return command.strip().upper(), payload


def send_raw_line(sock, text):
    """
    Отправляет одну строку напрямую в сокет.

    Эта функция используется до регистрации клиента,
    когда у нас еще нет записи о клиенте в общем словаре.
    """
    sock.sendall((text + "\n").encode("utf-8"))


def send_line(client_info, text):
    """
    Безопасно отправляет одну строку клиенту.

    На один и тот же сокет могут отправлять данные разные потоки,
    поэтому для каждого клиента используется отдельная блокировка отправки.
    """
    try:
        with client_info["send_lock"]:
            client_info["socket"].sendall((text + "\n").encode("utf-8"))
        return True
    except OSError:
        return False


def send_info(client_info, text):
    """
    Отправляет клиенту информационное сообщение.
    """
    return send_line(client_info, "INFO|" + encode_text(text))


def send_error(client_info, text):
    """
    Отправляет клиенту сообщение об ошибке.
    """
    return send_line(client_info, "ERROR|" + encode_text(text))


def send_chat_message(client_info, sender_name, text, mode, targets, timestamp):
    """
    Отправляет клиенту строку чата с метаданными маршрутизации.
    """
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
    return send_line(client_info, "MESSAGE|" + packet)


def remember_user(name):
    """
    Регистрирует имя клиента как известного пользователя сервера.
    """
    with clients_lock:
        known_users.add(name)
        user_chats.setdefault(name, set())


def build_chat_members(sender_name, mode, targets):
    """
    Возвращает chat_id и набор участников истории для сообщения.
    """
    normalized_targets = targets or []

    if mode == "all":
        members = set(known_users)
        members.add(sender_name)
        return GENERAL_CHAT_ID, members

    if mode == "none" or not normalized_targets:
        return "chat:self:" + sender_name, {sender_name}

    members = set(normalized_targets)
    members.add(sender_name)
    return "chat:group:" + "|".join(sorted(members)), members


def store_message(sender_name, message, mode, targets=None):
    """
    Сохраняет сообщение в in-memory истории до доставки адресатам.
    """
    with clients_lock:
        normalized_targets = [] if mode != "custom" else sorted(targets or [])
        chat_id, members = build_chat_members(sender_name, mode, normalized_targets)
        stored_message = {
            "chat_id": chat_id,
            "sender": sender_name,
            "content": message,
            "mode": mode,
            "targets": normalized_targets,
            "timestamp": int(datetime.now().timestamp() * 1000),
        }

        chat_history.setdefault(chat_id, []).append(stored_message)

        for member in members:
            known_users.add(member)
            user_chats.setdefault(member, set()).add(chat_id)

        return stored_message


def store_server_response(original_chat_id, response_text, mode, targets, original_sender):
    """
    Сохраняет и отправляет ответ сервера на сообщение с маркером <@>.
    """
    with clients_lock:
        if mode == "all":
            server_targets = []
        elif mode == "none":
            server_targets = [original_sender]
        else:
            server_targets = sorted(set((targets or []) + [original_sender]))
        stored_message = {
            "chat_id": original_chat_id,
            "sender": "Server",
            "content": response_text,
            "mode": mode,
            "targets": server_targets,
            "timestamp": int(datetime.now().timestamp() * 1000) + 1,
        }

        chat_history.setdefault(original_chat_id, []).append(stored_message)

        return stored_message


def send_sync_history(client_info):
    """
    Отправляет клиенту всю сохранённую историю чатов, к которым он принадлежит.
    """
    with clients_lock:
        messages = []
        for chat_id in user_chats.get(client_info["name"], set()):
            messages.extend(chat_history.get(chat_id, []))

    messages.sort(key=lambda item: item["timestamp"])
    payload = json.dumps(
        {"messages": messages},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    send_line(client_info, "SYNC_HISTORY|" + payload)


def get_client_names():
    """
    Возвращает отсортированный список имен подключенных клиентов.
    """
    with clients_lock:
        return sorted(clients.keys())


def send_client_list_to_one(client_info):
    """
    Отправляет одному клиенту список всех подключенных клиентов.
    """
    client_names = get_client_names()
    send_line(client_info, "CLIENTS|" + ",".join(client_names))
    with clients_lock:
        client_platforms = {
            name: clients[name].get("platform", "desktop")
            for name in client_names
            if name in clients
        }
    send_line(
        client_info,
        "CLIENTS_META|" + json.dumps(
            client_platforms,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    )


def broadcast_client_list(excluded_names=None):
    """
    Рассылает всем клиентам обновленный список подключенных клиентов.
    """
    excluded_names = excluded_names or set()

    with clients_lock:
        recipients = [
            client_info
            for client_info in clients.values()
            if client_info["name"] not in excluded_names
        ]
        client_names = sorted(clients.keys())
        client_platforms = {
            name: clients[name].get("platform", "desktop")
            for name in client_names
        }

    packet = "CLIENTS|" + ",".join(client_names)
    meta_packet = "CLIENTS_META|" + json.dumps(
        client_platforms,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    for client_info in recipients:
        send_line(client_info, packet)
        send_line(client_info, meta_packet)


def validate_client_name(name):
    """
    Проверяет корректность имени клиента.

    Для простоты имени запрещены символы-разделители протокола:
    - '|'
    - ','
    """
    cleaned_name = name.strip()

    if cleaned_name == "":
        return False, "Имя клиента не должно быть пустым."

    if "|" in cleaned_name or "," in cleaned_name:
        return False, "Имя клиента не должно содержать символы '|' и ','."

    return True, cleaned_name


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

    Поддерживает:
    - legacy LOGIN|Ivan
    - JSON   LOGIN|{"name":"Ivan","platform":"android"}
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


def register_client(client_socket, client_address, reader):
    """
    Выполняет регистрацию нового клиента.

    Клиент должен сразу после подключения отправить команду:
    LOGIN|имя
    """
    login_line = reader.readline()

    if not login_line:
        return None

    command, payload = parse_command(login_line.rstrip("\n"))

    if command != "LOGIN":
        send_raw_line(
            client_socket,
            "ERROR|Сначала необходимо отправить имя клиента командой LOGIN|имя."
        )
        return None

    is_valid, result, client_platform = parse_login_payload(payload)

    if not is_valid:
        send_raw_line(client_socket, "ERROR|" + result)
        return None

    client_name = result

    with clients_lock:
        if client_name in clients:
            send_raw_line(
                client_socket,
                "ERROR|Клиент с таким именем уже подключен. Выберите другое имя."
            )
            return None

        client_info = {
            "name": client_name,
            "platform": client_platform,
            "socket": client_socket,
            "address": client_address,
            "send_lock": threading.Lock(),
            # По умолчанию клиент получает сообщения от всех.
            # Это сохраняет поведение "всем одинаковую информацию".
            "group_mode": "all",
            "group": set(),
        }

        clients[client_name] = client_info

    remember_user(client_name)
    send_line(client_info, "LOGIN_OK|" + client_name)
    send_sync_history(client_info)
    broadcast_client_list()

    log("Подключился клиент:", client_name, "[" + client_platform + "]", client_address)

    return client_info


def remove_client(client_name):
    """
    Удаляет клиента из общего словаря и закрывает его сокет.
    """
    client_info = None

    with clients_lock:
        client_info = clients.pop(client_name, None)

    if client_info is None:
        return

    try:
        client_info["socket"].close()
    except OSError:
        pass

    log("Клиент отключился:", client_name)
    broadcast_client_list()


def parse_message_payload(payload, sender_name, available_names, default_targets):
    """
    Разбирает MESSAGE payload.

    Поддерживает legacy-формат с простым текстом и JSON-формат:
    {"targets": ["Alice"], "content": "Привет"}.
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

    selected_targets = []
    seen_names = set()

    for raw_name in raw_targets:
        if not isinstance(raw_name, str):
            continue

        cleaned_name = raw_name.strip()
        if cleaned_name == "" or cleaned_name == sender_name:
            continue
        if cleaned_name not in available_names or cleaned_name in seen_names:
            continue

        selected_targets.append(cleaned_name)
        seen_names.add(cleaned_name)

    if mode == "all":
        return content, "all", None
    if mode == "none":
        return content, "none", []
    return content, "custom", selected_targets


def deliver_message_to_group(stored_message):
    """
    Готовит серверный ответ и отправляет его только нужным клиентам.
    """
    with clients_lock:
        if stored_message["mode"] == "all":
            recipients = list(clients.values())
        else:
            recipient_names = set(stored_message["targets"])
            recipient_names.add(stored_message["sender"])
            recipients = [
                client_info
                for name, client_info in clients.items()
                if name in recipient_names
            ]

    for recipient_info in recipients:
        send_chat_message(
            recipient_info,
            stored_message["sender"],
            stored_message["content"],
            stored_message["mode"],
            stored_message["targets"],
            stored_message["timestamp"],
        )


def parse_group_names(group_text, current_name, available_names):
    """
    Возвращает список имен группы без повторов и без имени самого клиента.

    Порядок имен сохраняется таким, как его ввел пользователь.
    """
    selected_names = []
    seen_names = set()

    for raw_name in group_text.split(","):
        cleaned_name = raw_name.strip()

        if cleaned_name == "" or cleaned_name == current_name:
            continue

        if cleaned_name not in available_names or cleaned_name in seen_names:
            continue

        selected_names.append(cleaned_name)
        seen_names.add(cleaned_name)

    return selected_names


def update_client_group(client_info, payload):
    """
    Обновляет группу адресатов по умолчанию для legacy MESSAGE-команд.

    Возможные варианты:
    - GROUP|all       -> отправлять всем
    - GROUP|          -> отправлять только себе
    - GROUP|Ivan,Anna -> отправлять только указанным клиентам
    """
    group_text = payload.strip()

    with clients_lock:
        all_names = set(known_users)

        if group_text.lower() == "all":
            client_info["group_mode"] = "all"
            client_info["group"] = set()
        else:
            selected_names = parse_group_names(
                group_text,
                client_info["name"],
                all_names,
            )
            client_info["group_mode"] = "custom"
            client_info["group"] = set(selected_names)


def handle_registered_client(client_info, reader):
    """
    Основной цикл обслуживания зарегистрированного клиента.
    """
    client_name = client_info["name"]

    try:
        while True:
            line = reader.readline()

            if not line:
                break

            command, payload = parse_command(line.rstrip("\n"))

            if command == "MESSAGE":
                with clients_lock:
                    if client_info["group_mode"] == "all":
                        default_targets = None
                    else:
                        default_targets = sorted(client_info["group"])
                    available_names = set(known_users)

                message_text, mode, targets = parse_message_payload(
                    payload,
                    client_name,
                    available_names,
                    default_targets,
                )

                if message_text.strip() == "":
                    send_error(client_info, "Пустое сообщение не отправлено.")
                    continue

                if mode == "all":
                    log("Сообщение от", client_name + ":", message_text, "-> ALL")
                else:
                    log(
                        "Сообщение от",
                        client_name + ":",
                        message_text,
                        "->",
                        ",".join(targets) if targets else "(self)",
                    )

                stored_message = store_message(client_name, message_text, mode, targets)
                deliver_message_to_group(stored_message)

                if MARKER in message_text:
                    response_text = build_response_text(message_text)
                    server_stored = store_server_response(
                        stored_message["chat_id"],
                        response_text,
                        mode,
                        targets,
                        client_name,
                    )
                    deliver_message_to_group(server_stored)
            elif command == "GROUP":
                update_client_group(client_info, payload)
            elif command == "LIST":
                send_client_list_to_one(client_info)
            elif command == "QUIT":
                break
            else:
                send_error(client_info, "Неизвестная команда клиента.")
    except OSError as error:
        log("Ошибка при работе с клиентом", client_name + ":", error)
    finally:
        try:
            reader.close()
        except OSError:
            pass

        remove_client(client_name)


def handle_client_connection(client_socket, client_address):
    """
    Полностью обслуживает подключение одного клиента.

    Для каждого клиента запускается отдельный поток.
    """
    reader = client_socket.makefile("r", encoding="utf-8")

    try:
        client_info = register_client(client_socket, client_address, reader)

        if client_info is None:
            try:
                reader.close()
            except OSError:
                pass

            client_socket.close()
            return

        handle_registered_client(client_info, reader)
    except OSError as error:
        log("Ошибка соединения с клиентом", client_address, ":", error)
        try:
            reader.close()
        except OSError:
            pass

        client_socket.close()


def serve_udp_discovery(stop_event, tcp_port):
    """
    Отвечает на UDP Broadcast discovery-запросы в локальной сети.
    """
    discovery_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    discovery_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    discovery_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    try:
        discovery_socket.bind(("", DISCOVERY_PORT))
    except OSError as error:
        log("Предупреждение: UDP discovery недоступен:", error)
        discovery_socket.close()
        return

    discovery_socket.settimeout(1.0)
    response = build_discovery_response(tcp_port)

    while not stop_event.is_set():
        try:
            data, client_address = discovery_socket.recvfrom(512)
        except socket.timeout:
            continue
        except OSError:
            break

        try:
            request_text = data.decode("utf-8").strip()
        except UnicodeDecodeError:
            continue

        if request_text != DISCOVERY_REQUEST:
            continue

        try:
            discovery_socket.sendto(response, client_address)
        except OSError:
            continue

    discovery_socket.close()


def main():
    """
    Точка входа в программу сервера.
    """
    if len(sys.argv) != 2:
        show_usage()
        return

    try:
        port = int(sys.argv[1])
    except ValueError:
        print("Ошибка: номер порта должен быть целым числом.")
        return

    if port < 1 or port > 65535:
        print("Ошибка: номер порта должен быть в диапазоне от 1 до 65535.")
        return

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    # На Windows этот параметр запрещает двум серверам одновременно
    # использовать один и тот же порт.
    if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)

    try:
        server_socket.bind(("", port))
    except OSError as error:
        print(
            "Ошибка: не удалось запустить сервер на порту",
            port,
            ". Возможно, этот порт уже занят."
        )
        print("Текст ошибки:", error)
        server_socket.close()
        return

    server_socket.listen(10)
    stop_event = threading.Event()
    discovery_thread = threading.Thread(
        target=serve_udp_discovery,
        args=(stop_event, port),
        daemon=True,
    )
    discovery_thread.start()

    log("Сервер запущен.")
    log("Порт:", port)
    log("UDP discovery:", DISCOVERY_PORT)
    log("Сервер поддерживает несколько клиентов одновременно.")
    log("Для остановки сервера нажмите Ctrl+C.")
    log()

    try:
        while True:
            client_socket, client_address = server_socket.accept()

            client_thread = threading.Thread(
                target=handle_client_connection,
                args=(client_socket, client_address),
                daemon=True,
            )
            client_thread.start()
    except KeyboardInterrupt:
        log()
        log("Сервер остановлен пользователем.")
    finally:
        stop_event.set()
        server_socket.close()
        discovery_thread.join(timeout=1)


if __name__ == "__main__":
    main()
