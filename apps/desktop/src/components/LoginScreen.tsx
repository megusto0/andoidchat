import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ConnectionStatus } from "../types";
import s from "./LoginScreen.module.css";

interface DiscoveryResult {
  host: string;
  port: number;
}

interface Props {
  onConnect: (host: string, port: number, name: string) => void;
  onDiscoverServer: () => Promise<DiscoveryResult | null>;
  status: ConnectionStatus;
  error: string | null;
}

export function LoginScreen({
  onConnect,
  onDiscoverServer,
  status,
  error,
}: Props) {
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("5000");
  const [name, setName] = useState("");
  const hostEditedRef = useRef(false);
  const portEditedRef = useRef(false);
  const [discoveryState, setDiscoveryState] = useState<
    "idle" | "searching" | "found" | "not_found"
  >("idle");
  const [discoveryText, setDiscoveryText] = useState(
    "Ищем TCP-сервер в локальной сети…"
  );

  const connecting = status === "connecting";

  useEffect(() => {
    let active = true;

    async function runDiscovery() {
      setDiscoveryState("searching");
      setDiscoveryText("Ищем TCP-сервер в локальной сети…");

      const discovered = await onDiscoverServer();
      if (!active) return;

      if (discovered) {
        if (!hostEditedRef.current) setHost(discovered.host);
        if (!portEditedRef.current) setPort(String(discovered.port));
        setDiscoveryState("found");
        setDiscoveryText(
          `Сервер найден автоматически: ${discovered.host}:${discovered.port}`
        );
      } else {
        setDiscoveryState("not_found");
        setDiscoveryText(
          "Сервер не найден автоматически. Укажите IP-адрес и порт вручную."
        );
      }
    }

    void runDiscovery();

    return () => {
      active = false;
    };
  }, [onDiscoverServer]);

  async function handleDiscoverClick() {
    setDiscoveryState("searching");
    setDiscoveryText("Повторно ищем TCP-сервер в локальной сети…");

    const discovered = await onDiscoverServer();
    if (discovered) {
      setHost(discovered.host);
      setPort(String(discovered.port));
      setDiscoveryState("found");
      setDiscoveryText(
        `Сервер найден автоматически: ${discovered.host}:${discovered.port}`
      );
    } else {
      setDiscoveryState("not_found");
      setDiscoveryText(
        "Сервер не найден автоматически. Укажите IP-адрес и порт вручную."
      );
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || connecting) return;
    onConnect(host.trim(), Number(port), name.trim());
  }

  return (
    <div className={s.backdrop}>
      <form className={s.card} onSubmit={handleSubmit}>
        <div className={s.logoWrap}>
          <div className={s.logoIcon}>
            <svg className={s.logoSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
        </div>
        <h1 className={s.title}>TCP Messenger</h1>
        <p className={s.subtitle}>
          Подключитесь к TCP-серверу для обмена сообщениями
        </p>
        <div className={s.discoveryPanel}>
          <div
            className={`${s.discoveryStatus} ${
              discoveryState === "found" ? s.discoveryFound : ""
            } ${discoveryState === "not_found" ? s.discoveryFallback : ""}`}
          >
            {discoveryState === "searching" && <span className={s.discoverySpinner} />}
            <span>{discoveryText}</span>
          </div>
          <button
            className={s.discoveryButton}
            type="button"
            onClick={() => void handleDiscoverClick()}
            disabled={discoveryState === "searching"}
          >
            Найти сервер
          </button>
        </div>

        <div className={s.serverRow}>
          <div className={s.field}>
            <label className={s.label} htmlFor="login-host">IP-адрес</label>
            <input
              id="login-host"
              className={s.input}
              value={host}
              onChange={(e) => {
                hostEditedRef.current = true;
                setHost(e.target.value);
              }}
              placeholder="127.0.0.1"
              aria-label="IP-адрес сервера"
            />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="login-port">Порт</label>
            <input
              id="login-port"
              className={s.input}
              value={port}
              onChange={(e) => {
                portEditedRef.current = true;
                setPort(e.target.value);
              }}
              placeholder="5000"
              aria-label="Порт сервера"
            />
          </div>
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="login-name">Имя пользователя</label>
          <input
            id="login-name"
            className={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите ваше имя"
            aria-label="Имя пользователя"
            autoFocus
          />
        </div>

        <button
          className={s.button}
          type="submit"
          disabled={!name.trim() || connecting}
        >
          {connecting && <span className={s.spinner} />}
          {connecting ? "Подключение..." : "Подключиться"}
        </button>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.hint}>
          Проверка варианта 16: &lt;@&gt; level madam radar
        </div>
      </form>
    </div>
  );
}
