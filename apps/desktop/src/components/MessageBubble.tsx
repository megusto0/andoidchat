import { memo } from "react";
import type { Message } from "../types";
import { formatSimulationSender } from "../utils/simulationNames";
import s from "./MessageBubble.module.css";

interface Props {
  message: Message;
  ownName: string;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isOnline?: boolean;
  animate?: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(d: Date): string {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

const IP_PORT_RE = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/;

function getMonogramHue(name: string): number {
  return (name.charCodeAt(0) * 47) % 360;
}

function MessageBubbleInner({
  message,
  isFirstInGroup = true,
  isLastInGroup = true,
  isOnline = false,
  animate = true,
}: Props) {
  const isOwn = message.type === "own";
  const isOther = message.type === "other";
  const isInfo = message.type === "info";
  const isError = message.type === "error";
  const displaySender = formatSimulationSender(
    message.sender,
    Boolean(message.simulationId)
  );

  if (isInfo) {
    const ipMatch = message.text.match(IP_PORT_RE);
    const ip = ipMatch?.[0] ?? null;
    const displayText = ip
      ? message.text.replace(ip, "").replace(/\s{2,}/g, " ").trim()
      : message.text;

    const icon = message.text.includes("присоединился") ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14m-7-7h14" />
      </svg>
    ) : message.text.includes("отключился") ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h16" />
      </svg>
    ) : (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    );

    return (
      <div className={s.systemRow}>
        <div className={s.systemBadge}>
          {icon}
          <span>{displayText}</span>
          {ip && <span className={s.systemIp}>{ip}</span>}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={s.systemRow}>
        <div className={`${s.systemBadge} ${s.systemError}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{message.text}</span>
        </div>
      </div>
    );
  }

  const spacingClass = isFirstInGroup ? s.rowSpaced : s.rowGrouped;

  let bubbleShape = "";
  if (isOwn) {
    if (isFirstInGroup && isLastInGroup) bubbleShape = s.bubbleOwn;
    else if (isFirstInGroup) bubbleShape = s.bubbleOwnFirst;
    else if (isLastInGroup) bubbleShape = s.bubbleOwnLast;
    else bubbleShape = s.bubbleOwnMiddle;
  } else {
    if (isFirstInGroup && isLastInGroup) bubbleShape = s.bubbleOther;
    else if (isFirstInGroup) bubbleShape = s.bubbleOtherFirst;
    else if (isLastInGroup) bubbleShape = s.bubbleOtherLast;
    else bubbleShape = s.bubbleOtherMiddle;
  }

  const hue = getMonogramHue(displaySender);

  return (
    <div
      className={`${s.row} ${isOwn ? s.rowOwn : s.rowOther} ${spacingClass} ${
        animate ? "" : s.rowStatic
      }`}
    >
      {isOther && (
        isFirstInGroup ? (
          <div className={s.avatar} style={{ background: `oklch(0.32 0.04 ${hue})`, color: `oklch(0.85 0.05 ${hue})` }}>
            {displaySender.charAt(0).toUpperCase()}
            {isOnline && <span className={s.avatarOnline} />}
          </div>
        ) : (
          <div className={s.avatarPlaceholder} />
        )
      )}
      <div className={s.bubbleWrap}>
        {isOther && isFirstInGroup && (
          <div className={s.sender}>
            <span className={s.senderName}>{displaySender}</span>
            <span className={s.senderTime}>{formatTime(message.timestamp)}</span>
          </div>
        )}
        <div className={`${s.bubble} ${isOwn ? s.bubbleOwn : s.bubbleOther} ${bubbleShape}`}>
          <div className={s.text}>{message.text}</div>
        </div>
        {isOwn && isLastInGroup && (
          <div className={s.ownMeta}>
            {formatTime(message.timestamp)} · доставлено
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
