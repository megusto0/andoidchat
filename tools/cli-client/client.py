# Файл адаптирован для совместимости с server_async.py.
# ИЗМЕНЕНИЕ: добавлен таймаут на подключение к серверу (socket.settimeout).

import json
import socket
import shutil
import sys
import threading


print_lock = threading.RLock()
console_state = {
    "prompt": "",
    "input_active": False,
    "group_mode": "all",
    "group_target": "",
    "client_name": "",
}

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"

FG_YELLOW = "\033[33m"
FG_CYAN = "\033[36m"
FG_GREEN = "\033[32m"
FG_RED = "\033[31m"
FG_MAGENTA = "\033[35m"
FG_WHITE = "\033[37m"


def show_usage():
    """
    Выводит краткую инструкцию по запуску клиента.
    """
    print("Использование: python client.py <IP-адрес_сервера> <порт>")


def get_input_prompt(client_name):
    with print_lock:
        mode = console_state["group_mode"]
        target = console_state["group_target"]

    if mode == "all":
        dest = "All"
    elif mode == "none":
        dest = "Self"
    else:
        dest = target if target else "?"

    return "[" + client_name + " -> " + dest + "] > "


def set_input_prompt(client_name):
    with print_lock:
        console_state["client_name"] = client_name
        console_state["prompt"] = get_input_prompt(client_name)


def redraw_prompt_locked():
    """
    Перерисовывает приглашение ввода.

    В обычной консоли без сторонних библиотек нельзя идеально вернуть
    уже набранный пользователем текст после прихода сообщения из другого
    потока, поэтому используем простой и стабильный учебный вариант:
    печатаем входящее сообщение отдельным блоком и снова показываем prompt.
    """
    if console_state["input_active"] and console_state["prompt"]:
        sys.stdout.write(console_state["prompt"])
        sys.stdout.flush()


def clear_input_line_locked():
    """
    Очищает текущую консольную строку перед выводом входящего сообщения.

    Это уменьшает визуальный шум: prompt не остается отдельной строкой
    перед каждым новым сообщением.
    """
    terminal_width = shutil.get_terminal_size(fallback=(80, 24)).columns
    clear_width = max(1, terminal_width - 1)
    sys.stdout.write("\r" + (" " * clear_width) + "\r")


def show_input_prompt():
    """
    Отображает приглашение ввода и помечает, что клиент ждет ввод.
    """
    with print_lock:
        console_state["input_active"] = True
        redraw_prompt_locked()


def hide_input_prompt():
    """
    Помечает, что клиент временно не находится в режиме ввода.
    """
    with print_lock:
        console_state["input_active"] = False


def safe_print(text="", redraw_prompt=True):
    """
    Потокобезопасный вывод текста в консоль.
    """
    with print_lock:
        if console_state["input_active"]:
            clear_input_line_locked()

        sys.stdout.write(str(text) + "\n")

        if redraw_prompt:
            redraw_prompt_locked()
        else:
            sys.stdout.flush()


def decode_text(text):
    """
    Восстанавливает текст, который был экранирован сервером.

    Это позволяет передавать один MESSAGE-пакет одной строкой протокола,
    но при этом отображать внутри него реальные переводы строк.
    """
    result = []
    escaped = False

    for symbol in text:
        if not escaped:
            if symbol == "\\":
                escaped = True
            else:
                result.append(symbol)
            continue

        if symbol == "n":
            result.append("\n")
        elif symbol == "\\":
            result.append("\\")
        else:
            result.append("\\" + symbol)

        escaped = False

    if escaped:
        result.append("\\")

    return "".join(result)


def print_block(prefix, text, color=""):
    lines = text.split("\n")

    if not lines:
        lines = [""]

    colored_prefix = color + BOLD + prefix + RESET if color else prefix
    indented_lines = [colored_prefix + lines[0]]
    indent = " " * len(prefix)

    for line in lines[1:]:
        indented_lines.append(color + indent + line + RESET if color else indent + line)

    safe_print("\n".join(indented_lines))


def parse_server_line(line):
    """
    Разбирает строку, пришедшую от сервера.
    """
    if "|" in line:
        command, payload = line.split("|", 1)
    else:
        command = line
        payload = ""

    return command.strip().upper(), payload


def send_line(sock, text):
    """
    Отправляет одну строку серверу.
    """
    sock.sendall((text + "\n").encode("utf-8"))


def validate_client_name(name):
    """
    Проверяет корректность имени клиента.

    Символы '|' и ',' запрещены,
    потому что они используются в текстовом протоколе.
    """
    cleaned_name = name.strip()

    if cleaned_name == "":
        return False, "Имя клиента не должно быть пустым."

    if "|" in cleaned_name or "," in cleaned_name:
        return False, "Имя клиента не должно содержать символы '|' и ','."

    return True, cleaned_name


def show_help():
    print_block("[Система] ", "Список команд:", FG_CYAN)
    safe_print(
        FG_CYAN + "  /help" + DIM + "              - показать список команд\n"
        + FG_CYAN + "  /clients" + DIM + "           - запросить список подключенных клиентов\n"
        + FG_CYAN + "  /group all" + DIM + "         - отправлять новые сообщения всем клиентам\n"
        + FG_CYAN + "  /group none" + DIM + "        - отправлять новые сообщения только себе\n"
        + FG_CYAN + "  /group Ivan,Anna" + DIM + "   - отправлять сообщения указанным клиентам\n"
        + FG_CYAN + "  /exit" + DIM + "              - выйти из программы\n"
        + DIM + "  Любой другой текст отправляется как обычное сообщение." + RESET
    )


def receive_messages(reader, stop_event):
    """
    Фоновый поток приема данных от сервера.

    Пока пользователь вводит сообщения с клавиатуры,
    этот поток параллельно принимает и отображает ответы сервера.
    """
    try:
        while not stop_event.is_set():
            line = reader.readline()

            if not line:
                if not stop_event.is_set():
                    safe_print("Соединение с сервером закрыто.", redraw_prompt=False)
                stop_event.set()
                break

            command, payload = parse_server_line(line.rstrip("\n"))

            if command == "INFO":
                print_block("[Сервер] ", decode_text(payload), FG_CYAN)
            elif command == "ERROR":
                print_block("[Ошибка] ", decode_text(payload), FG_RED)
            elif command == "CLIENTS":
                client_names = []

                if payload.strip() != "":
                    client_names = [name for name in payload.split(",") if name.strip() != ""]

                print_block(
                    "[Сервер] ",
                    "Подключенные клиенты: " + ", ".join(client_names)
                    if client_names
                    else "Подключенных клиентов нет.",
                    FG_CYAN,
                )
            elif command == "CLIENTS_META":
                continue
            elif command == "SYNC_HISTORY":
                try:
                    parsed = json.loads(payload)
                    messages = parsed.get("messages", [])
                    count = len(messages) if isinstance(messages, list) else 0
                    if count > 0:
                        print_block("[Сервер] ", "История синхронизирована: " + str(count) + " сообщений.", FG_CYAN)
                except json.JSONDecodeError:
                    pass
            elif command == "MESSAGE":
                sender_name = "Неизвестно"
                message_text = decode_text(payload)

                try:
                    parsed = json.loads(payload)
                    if (
                        isinstance(parsed, dict)
                        and isinstance(parsed.get("sender"), str)
                        and isinstance(parsed.get("content"), str)
                    ):
                        sender_name = parsed["sender"]
                        message_text = parsed["content"]
                except json.JSONDecodeError:
                    parts = payload.split("|", 1)

                    if len(parts) == 2:
                        sender_name = parts[0]
                        message_text = decode_text(parts[1])

                with print_lock:
                    own_name = console_state["client_name"]

                if sender_name == "Server":
                    msg_color = FG_YELLOW
                elif sender_name == own_name:
                    msg_color = ""
                else:
                    msg_color = FG_GREEN

                print_block("[" + sender_name + "] ", message_text, msg_color)
            else:
                print_block("[Неизвестный пакет] ", line.rstrip("\n"))
    except OSError as error:
        if not stop_event.is_set():
            stop_event.set()
            safe_print("Ошибка при получении данных от сервера: " + str(error), redraw_prompt=False)
    finally:
        try:
            reader.close()
        except OSError:
            pass


def update_group_state(mode, target_label):
    with print_lock:
        console_state["group_mode"] = mode
        console_state["group_target"] = target_label
        console_state["prompt"] = get_input_prompt(console_state["client_name"])


def handle_group_command(sock, user_input):
    group_text = user_input[len("/group"):].strip()

    if group_text == "":
        safe_print("Пример: /group all\nПример: /group none\nПример: /group Ivan,Anna")
        return

    if group_text.lower() == "all":
        send_line(sock, "GROUP|all")
        update_group_state("all", "")
        print_block("[Система] ", "Переключено на: Все клиенты", FG_CYAN)
        return

    if group_text.lower() == "none":
        send_line(sock, "GROUP|")
        update_group_state("none", "")
        print_block("[Система] ", "Переключено на: Только Self", FG_CYAN)
        return

    selected_names = []

    for raw_name in group_text.split(","):
        cleaned_name = raw_name.strip()

        if cleaned_name != "":
            selected_names.append(cleaned_name)

    if not selected_names:
        safe_print("Группа не указана.")
        return

    send_line(sock, "GROUP|" + ",".join(selected_names))
    target_label = ", ".join(selected_names)
    update_group_state("custom", target_label)
    print_block("[Система] ", "Переключено на: " + target_label, FG_CYAN)


def main():
    """
    Точка входа в программу клиента.
    """
    if len(sys.argv) != 3:
        show_usage()
        return

    server_ip = sys.argv[1]

    try:
        server_port = int(sys.argv[2])
    except ValueError:
        print("Ошибка: номер порта должен быть целым числом.")
        return

    if server_port < 1 or server_port > 65535:
        print("Ошибка: номер порта должен быть в диапазоне от 1 до 65535.")
        return

    try:
        client_name = input("Введите имя клиента: ")
    except EOFError:
        print("Ошибка: имя клиента не введено.")
        return

    is_valid, result = validate_client_name(client_name)

    if not is_valid:
        print("Ошибка:", result)
        return

    client_name = result

    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    # ИЗМЕНЕНИЕ: таймаут 10 секунд на подключение, чтобы пользователь
    # не ждал бесконечно при недоступном сервере.
    client_socket.settimeout(10)

    try:
        client_socket.connect((server_ip, server_port))
    except OSError as error:
        print("Ошибка: не удалось подключиться к серверу.")
        print("Проверьте IP-адрес, порт и то, что сервер запущен.")
        print("Текст ошибки:", error)
        client_socket.close()
        return

    # ИЗМЕНЕНИЕ: возвращаем блокирующий режим без таймаута
    # для нормальной работы readline() в фоновом потоке.
    client_socket.settimeout(None)

    reader = client_socket.makefile("r", encoding="utf-8")

    stop_event = threading.Event()
    receiver_thread = threading.Thread(
        target=receive_messages,
        args=(reader, stop_event),
        daemon=True,
    )

    try:
        send_line(
            client_socket,
            "LOGIN|" + json.dumps(
                {
                    "name": client_name,
                    "platform": "desktop",
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )

        first_line = reader.readline()

        if not first_line:
            print("Ошибка: сервер закрыл соединение сразу после подключения.")
            return

        command, payload = parse_server_line(first_line.rstrip("\n"))

        if command == "ERROR":
            print("Ошибка:", payload)
            return

        if command != "LOGIN_OK":
            print("Ошибка: получен неожиданный ответ сервера.")
            print("Ответ сервера:", first_line.rstrip("\n"))
            return

        client_name = payload.strip() or client_name
        set_input_prompt(client_name)

        safe_print("Вы вошли как: " + client_name)
        safe_print("Введите /help, чтобы посмотреть список команд.")

        receiver_thread.start()

        while not stop_event.is_set():
            try:
                show_input_prompt()
                user_input = input().strip()
            except EOFError:
                break
            finally:
                hide_input_prompt()

            if user_input == "":
                continue

            if user_input == "/help":
                show_help()
                continue

            if user_input == "/clients":
                print_block("[Система] ", "Запрос списка клиентов...", FG_CYAN)
                send_line(client_socket, "LIST|")
                continue

            if user_input.startswith("/group"):
                handle_group_command(client_socket, user_input)
                continue

            if user_input in ("/exit", "/quit"):
                stop_event.set()
                try:
                    send_line(client_socket, "QUIT|")
                except OSError:
                    pass
                break

            send_line(client_socket, "MESSAGE|" + user_input)
    except KeyboardInterrupt:
        safe_print("\nКлиент остановлен пользователем.", redraw_prompt=False)
    except OSError as error:
        safe_print("Ошибка при обмене данными с сервером: " + str(error), redraw_prompt=False)
    finally:
        stop_event.set()

        try:
            reader.close()
        except OSError:
            pass

        try:
            client_socket.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

        try:
            client_socket.close()
        except OSError:
            pass

        if receiver_thread.is_alive():
            receiver_thread.join(timeout=1)


if __name__ == "__main__":
    main()
