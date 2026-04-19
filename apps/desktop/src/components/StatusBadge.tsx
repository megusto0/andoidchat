import type { PropsWithChildren } from "react";
import s from "./StatusBadge.module.css";

export type StatusBadgeVariant = "ready" | "active" | "live" | "ok" | "error";

interface Props extends PropsWithChildren {
  variant: StatusBadgeVariant;
}

const VARIANT_CLASS: Record<StatusBadgeVariant, string> = {
  ready: s.badgeReady,
  active: s.badgeActive,
  live: s.badgeLive,
  ok: s.badgeOk,
  error: s.badgeError,
};

export function StatusBadge({ variant, children }: Props) {
  return (
    <span className={`${s.badge} ${VARIANT_CLASS[variant]}`}>
      <span className={s.dot} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
