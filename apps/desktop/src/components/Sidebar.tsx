import { useState } from "react";
import type { ClientPlatform, ConnectionStatus, GroupMode } from "../types";
import { StatusBadge } from "./StatusBadge";
import s from "./Sidebar.module.css";

interface Props {
  userName: string;
  host: string;
  port: string;
  status: ConnectionStatus;
  clients: string[];
  onlineClients: Set<string>;
  clientPlatforms: Record<string, ClientPlatform>;
  groupMode: GroupMode;
  selectedClients: Set<string>;
  onSetGroup: (mode: GroupMode, selected: Set<string>) => void;
}

function avatarColors(letter: string) {
  const hue = (letter.charCodeAt(0) * 47) % 360;
  const bg = `oklch(0.32 0.04 ${hue})`;
  const fg = `oklch(0.85 0.05 ${hue})`;
  return { bg, fg };
}

export function Sidebar({
  userName,
  host,
  port,
  status,
  clients,
  onlineClients,
  clientPlatforms,
  groupMode,
  selectedClients,
  onSetGroup,
}: Props) {
  const [search, setSearch] = useState("");

  const orderedClients = [...clients].sort((a, b) => {
    if (a === userName) return -1;
    if (b === userName) return 1;
    return a.localeCompare(b, "ru");
  });
  const otherClients = orderedClients.filter((c) => c !== userName);
  const hasSelected = selectedClients.size > 0;
  const searchValue = search.trim().toLowerCase();
  const endpoint = host && port ? `${host}:${port}` : "—";
  const visibleClients = searchValue
    ? otherClients.filter((name) =>
        name.toLowerCase().includes(searchValue)
      )
    : otherClients;

  function toggleClient(name: string) {
    const next =
      groupMode === "all" ? new Set(otherClients) : new Set(selectedClients);

    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }

    onSetGroup(next.size === 0 ? "none" : "custom", next);
  }

  function selectMode(mode: GroupMode) {
    if (mode === "custom" && otherClients.length === 0) return;

    if (mode === "all") {
      onSetGroup(
        "all",
        new Set(otherClients.filter((name) => onlineClients.has(name)))
      );
    } else if (mode === "none") {
      onSetGroup("none", new Set());
    } else {
      onSetGroup("custom", new Set(selectedClients));
    }
  }

  const selfColor = avatarColors(userName.charAt(0).toUpperCase());

  return (
    <aside className={s.sidebar}>
      <div className={s.userCard}>
        <div
          className={s.avatar}
          style={{ background: selfColor.bg, color: selfColor.fg }}
        >
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className={s.userInfo}>
          <div className={s.userNameText}>{userName}</div>
          <div className={s.userMetaRow}>
            <StatusBadge variant={status === "connected" ? "ok" : "ready"}>
              {status === "connected" ? "Подключен" : "Отключен"}
            </StatusBadge>
            <span className={s.endpointText}>{endpoint}</span>
          </div>
        </div>
      </div>

      <div className={`${s.section} ${s.clientSection} ${s.surfaceSection}`}>
        <div className={s.sectionHeader}>
          <span className={s.sectionTitle}>Клиенты</span>
          <span className={s.clientCount}>{otherClients.length}</span>
        </div>

        <label className={s.searchWrap}>
          <svg
            className={s.searchIcon}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={s.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по клиентам"
            aria-label="Поиск по клиентам"
          />
          <span className={s.searchHint}>⌘K</span>
        </label>

        <div className={s.clientListShell}>
          <div className={s.clientList}>
            {otherClients.length === 0 ? (
              <div className={s.empty}>Другие клиенты появятся здесь после подключения.</div>
            ) : orderedClients.length === 0 ? (
              <div className={s.empty}>Запрашиваем список подключённых клиентов...</div>
            ) : visibleClients.length === 0 ? (
              <div className={s.empty}>Ничего не найдено</div>
            ) : (
              visibleClients.map((name) => {
                const isSelected = selectedClients.has(name);
                const isOnline = onlineClients.has(name);
                const colors = avatarColors(name.charAt(0).toUpperCase());
                return (
                  <button
                    key={name}
                    type="button"
                    className={`${s.clientItem} ${isSelected ? s.clientItemSelected : ""} ${!isOnline ? s.clientItemOffline : ""}`}
                    onClick={() => toggleClient(name)}
                    aria-pressed={isSelected}
                  >
                    {isSelected && <span className={s.activeIndicator} />}
                    <div className={s.clientAvatarWrap}>
                      <div
                        className={s.clientAvatar}
                        style={{ background: colors.bg, color: colors.fg }}
                      >
                        {name.charAt(0).toUpperCase()}
                      </div>
                      {clientPlatforms[name] === "android" ? (
                        <span className={s.clientDeviceBadge} aria-label="Мобильный клиент">
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
                            <line x1="11" y1="18" x2="13" y2="18" />
                          </svg>
                        </span>
                      ) : (
                        <span
                          className={`${s.clientOnlineDot} ${!isOnline ? s.clientOfflineDot : ""}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className={s.clientInfo}>
                      <span className={s.clientName}>{name}</span>
                      <span className={s.clientPresenceText}>
                        {isOnline ? "В сети" : "Offline"}
                      </span>
                    </div>
                    <div className={s.clientAction}>
                      {isSelected && (
                        <span className={s.selectedBadge}>В ГРУППЕ</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className={`${s.section} ${s.surfaceSection}`}>
        <div className={s.sectionTitle}>Адресаты</div>
        <div className={s.groupModes}>
          {(["all", "none", "custom"] as GroupMode[]).map((mode) => {
            const isActive = groupMode === mode;
            const isDisabled =
              isActive || (mode === "custom" && otherClients.length === 0);
            return (
              <button
                key={mode}
                className={`${s.groupBtn} ${isActive ? s.groupBtnActive : ""}`}
                onClick={() => selectMode(mode)}
                disabled={isDisabled}
                aria-pressed={isActive}
              >
                {mode === "all" ? "Все" : mode === "none" ? "Никто" : "Группа"}
              </button>
            );
          })}
        </div>
        <div className={s.groupHint}>
          {groupMode === "all" && "Новые сообщения будут отправлены всем подключённым клиентам."}
          {groupMode === "none" && "Новые сообщения останутся только в вашем окне."}
          {groupMode === "custom" && (
            hasSelected
              ? `Новые сообщения будут отправлены только: ${Array.from(selectedClients).join(", ")}`
              : "Выберите клиентов, которым хотите отправлять новые сообщения."
          )}
        </div>
      </div>
    </aside>
  );
}
