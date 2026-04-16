import type { Message } from "../types";
import s from "./MessageBubble.module.css";

interface Props {
  message: Message;
  ownName: string;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(d: Date): string {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export function MessageBubble({
  message,
  isFirstInGroup = true,
  isLastInGroup = true,
}: Props) {
  const isOwn = message.type === "own";
  const isOther = message.type === "other";
  const isInfo = message.type === "info";
  const isError = message.type === "error";
  const isServer = isOther && message.sender === "Server";

  if (isInfo) {
    return (
      <div className={s.systemRow}>
        <div className={s.systemBadge}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{message.text}</span>
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

  const isMiddle = !isFirstInGroup && !isLastInGroup;
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

  return (
    <div className={`${s.row} ${isOwn ? s.rowOwn : s.rowOther} ${spacingClass}`}>
      {isOther && (
        isFirstInGroup ? (
          <div className={`${s.avatarSmall} ${isServer ? s.avatarServer : ""}`}>
            {isServer ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            ) : (
              message.sender.charAt(0).toUpperCase()
            )}
          </div>
        ) : (
          <div className={s.avatarPlaceholder} />
        )
      )}
      <div className={s.bubbleWrap}>
        {isOther && isFirstInGroup && (
          <div className={`${s.sender} ${isServer ? s.senderServer : ""}`}>
            {isServer && (
              <svg className={s.senderIcon} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            )}
            {message.sender}
          </div>
        )}
        <div className={`${s.bubble} ${isOwn ? s.bubbleOwn : isServer ? s.bubbleServer : s.bubbleOther} ${bubbleShape}`}>
          <div className={s.text}>{message.text}</div>
          <span className={`${s.time} ${isOwn ? s.timeOwn : s.timeOther} ${!isLastInGroup ? s.timeHidden : ""}`}>
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
