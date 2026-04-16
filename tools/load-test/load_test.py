"""
Нагрузочный тест для асинхронного TCP-сервера мессенджера.

Создаёт N параллельных клиентов, каждый из которых проходит полный
жизненный цикл: подключение, регистрация, отправка сообщений, проверка
ответов, отключение. По итогам печатает таблицу с метриками.

Запуск: python load_test.py --host 127.0.0.1 --port 5000 --clients 60
"""

import argparse
import asyncio
import random
import sys
import time
from collections import Counter

CLIENT_TIMEOUT = 30
CONNECT_STAGGER = 0.02
MESSAGES_PER_CLIENT = 10
MSG_DELAY_MIN = 0.05
MSG_DELAY_MAX = 0.3

CHECK_PALINDROMES = ["ANNA", "ШАЛАШ", "MADAM", "RADAR"]
NON_PALINDROME = "test"

PALINDROME_LINE_PREFIX = "Результат обработки после <@>: "
EXPECTED_PROCESSED = "ANNA ШАЛАШ MADAM RADAR test"


class Metrics:
    """Счётчики результатов нагрузочного теста."""

    def __init__(self):
        self.total = 0
        self.connected = 0
        self.failed = 0
        self.messages_sent = 0
        self.incorrect = 0
        self.lost = 0
        self.connect_times: list[float] = []
        self.response_times: list[float] = []


def decode_text(text):
    """
    Восстанавливает экранированный текст протокола.

    \\n → перевод строки, \\\\ → обратный слеш.
    """
    result = []
    escaped = False
    for ch in text:
        if not escaped:
            if ch == "\\":
                escaped = True
            else:
                result.append(ch)
            continue
        if ch == "n":
            result.append("\n")
        elif ch == "\\":
            result.append("\\")
        else:
            result.append("\\" + ch)
        escaped = False
    if escaped:
        result.append("\\")
    return "".join(result)


def parse_command(line):
    """
    Разбирает строку протокола на команду и полезную нагрузку.
    """
    if "|" in line:
        cmd, payload = line.split("|", 1)
    else:
        cmd = line
        payload = ""
    return cmd.strip().upper(), payload


def check_even_response(raw_payload: str) -> bool:
    """
    Проверяет корректность обработки палиндромов в чётном сообщении.

    Ожидает, что в многострочном ответе содержится строка с результатом
    обработки, в которой палиндромы переведены в верхний регистр,
    а непалиндромы оставлены без изменений.
    """
    decoded = decode_text(raw_payload)
    for part in decoded.split("\n"):
        part = part.strip()
        if part.startswith(PALINDROME_LINE_PREFIX):
            processed = part[len(PALINDROME_LINE_PREFIX):]
            return processed == EXPECTED_PROCESSED
    return False


async def read_responses(reader: asyncio.StreamReader, queue: asyncio.Queue, done: asyncio.Event):
    """
    Фоновая задача чтения всех входящих строк от сервера в очередь.
    """
    try:
        while not done.is_set():
            try:
                line_bytes = await asyncio.wait_for(reader.readline(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8").rstrip("\n")
            await queue.put(line)
    except (OSError, asyncio.CancelledError):
        pass


async def drain_initial(queue: asyncio.Queue, command: str, timeout: float = 5.0) -> str | None:
    """
    Читает из очереди до появления строки с указанной командой.

    Неподходящие строки отбрасываются.
    Используется для LOGIN_OK и CLIENTS на этапе начальной настройки.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            line = await asyncio.wait_for(queue.get(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        cmd, payload = parse_command(line)
        if cmd == command:
            return payload
    return None


async def read_responses(reader: asyncio.StreamReader, queue: asyncio.Queue, done: asyncio.Event):
    """
    Фоновая задача чтения всех входящих строк от сервера в очередь.
    """
    try:
        while not done.is_set():
            try:
                line_bytes = await asyncio.wait_for(reader.readline(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8").rstrip("\n")
            await queue.put(line)
    except (OSError, asyncio.CancelledError):
        pass


async def run_client(host: str, port: int, client_id: int, metrics: Metrics):
    """
    Запускает одного симулированного клиента.
    """
    name = f"bot_{client_id:03d}"
    metrics.total += 1
    connect_start = time.monotonic()

    try:
        async with asyncio.timeout(CLIENT_TIMEOUT):
            reader, writer = await asyncio.open_connection(host, port)
            metrics.connected += 1
            connect_elapsed = time.monotonic() - connect_start
            metrics.connect_times.append(connect_elapsed)

            queue: asyncio.Queue = asyncio.Queue()
            done = asyncio.Event()
            read_task = asyncio.create_task(read_responses(reader, queue, done))

            try:
                writer.write((f"LOGIN|{name}\n").encode("utf-8"))
                await writer.drain()

                payload = await drain_initial(queue, "LOGIN_OK", timeout=5.0)
                if payload is None:
                    metrics.failed += 1
                    return

                writer.write(b"LIST|\n")
                await writer.drain()

                list_payload = await drain_initial(queue, "CLIENTS", timeout=5.0)
                if list_payload is None or name not in list_payload.split(","):
                    metrics.failed += 1
                    return

                pending_even = 0
                for msg_num in range(1, MESSAGES_PER_CLIENT + 1):
                    delay = random.uniform(MSG_DELAY_MIN, MSG_DELAY_MAX)
                    await asyncio.sleep(delay)

                    if msg_num % 2 == 1:
                        text = f"Тестовое сообщение номер {msg_num} от {name}"
                    else:
                        text = "Проверка <@> Anna шалаш madam radar test"

                    send_time = time.monotonic()
                    writer.write((f"MESSAGE|{text}\n").encode("utf-8"))
                    await writer.drain()
                    metrics.messages_sent += 1

                    if msg_num % 2 == 0:
                        pending_even += 1

                        deadline = time.monotonic() + 15.0
                        found = False
                        while time.monotonic() < deadline:
                            remaining = deadline - time.monotonic()
                            if remaining <= 0:
                                break
                            try:
                                line = await asyncio.wait_for(queue.get(), timeout=remaining)
                            except asyncio.TimeoutError:
                                break
                            cmd, pl = parse_command(line)
                            if cmd == "MESSAGE":
                                sender = pl.split("|", 1)[0] if "|" in pl else ""
                                if sender == name:
                                    parts = pl.split("|", 1)
                                    if len(parts) == 2:
                                        decoded = decode_text(parts[1])
                                        if PALINDROME_LINE_PREFIX in decoded:
                                            if check_even_response(parts[1]):
                                                elapsed = time.monotonic() - send_time
                                                metrics.response_times.append(elapsed)
                                            else:
                                                metrics.incorrect += 1
                                            found = True
                                            break
                        if not found:
                            metrics.incorrect += 1

                writer.write(b"QUIT|\n")
                await writer.drain()
            finally:
                done.set()
                read_task.cancel()
                try:
                    await read_task
                except asyncio.CancelledError:
                    pass
                try:
                    writer.close()
                    await writer.wait_closed()
                except OSError:
                    pass
                try:
                    writer.close()
                    await writer.wait_closed()
                except OSError:
                    pass

    except asyncio.TimeoutError:
        metrics.lost += 1
    except (OSError, ConnectionRefusedError):
        metrics.failed += 1


def print_report(metrics: Metrics, total_time: float):
    """
    Печатает итоговую таблицу метрик с рамками.
    """
    avg_connect = (
        sum(metrics.connect_times) / len(metrics.connect_times)
        if metrics.connect_times
        else 0.0
    )
    avg_response = (
        sum(metrics.response_times) / len(metrics.response_times)
        if metrics.response_times
        else 0.0
    )

    passed = (
        metrics.connected >= 50
        and metrics.incorrect == 0
        and metrics.lost <= 2
    )

    rows = [
        ("Всего клиентов", str(metrics.total)),
        ("Успешных подключений", str(metrics.connected)),
        ("Неудачных подключений", str(metrics.failed)),
        ("Отправлено сообщений", str(metrics.messages_sent)),
        ("Некорректных ответов", str(metrics.incorrect)),
        ("Потерянных соединений", str(metrics.lost)),
        ("Время подключения всех", f"{avg_connect:.3f} сек"),
        ("Среднее время ответа", f"{avg_response:.3f} сек"),
        ("Общее время теста", f"{total_time:.2f} сек"),
        ("Результат", "ПРОЙДЕН" if passed else "НЕ ПРОЙДЕН"),
    ]

    label_width = max(len(r[0]) for r in rows)
    value_width = max(len(r[1]) for r in rows)
    inner = label_width + 3 + value_width

    top = "╔" + "═" * inner + "╗"
    sep = "╟" + "─" * inner + "╢"
    bot = "╚" + "═" * inner + "╝"

    print()
    print(top)
    for i, (label, value) in enumerate(rows):
        print(f"║ {label:<{label_width}} │ {value:>{value_width}} ║")
        if i < len(rows) - 1:
            print(sep)
    print(bot)
    print()

    return passed


async def main():
    """
    Точка входа: разбор аргументов, запуск теста, вывод отчёта.
    """
    parser = argparse.ArgumentParser(description="Нагрузочный тест TCP-сервера мессенджера")
    parser.add_argument("--host", default="127.0.0.1", help="Адрес сервера")
    parser.add_argument("--port", type=int, default=5000, help="Порт сервера")
    parser.add_argument("--clients", type=int, default=60, help="Количество клиентов")
    args = parser.parse_args()

    print(f"Запуск нагрузочного теста: {args.clients} клиентов → {args.host}:{args.port}")
    print()

    metrics = Metrics()
    start = time.monotonic()

    tasks = []
    for i in range(1, args.clients + 1):
        tasks.append(run_client(args.host, args.port, i, metrics))
        if i < args.clients:
            await asyncio.sleep(CONNECT_STAGGER)

    await asyncio.gather(*tasks, return_exceptions=True)

    total_time = time.monotonic() - start
    passed = print_report(metrics, total_time)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
