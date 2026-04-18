import type { SimBotStatus as BotStatus } from "../types";
import s from "./ConnectionGraph.module.css";

interface Props {
  bots: BotStatus[];
}

const MAX_VISIBLE = 60;

export function ConnectionGraph({ bots }: Props) {
  const visible = bots.slice(0, MAX_VISIBLE);
  const cx = 150;
  const cy = 120;
  const serverR = 18;
  const orbitR = 85;

  const statusClass: Record<string, string> = {
    connecting: s.botNodeConnecting,
    active: s.botNodeActive,
    done: s.botNodeDone,
    error: s.botNodeError,
  };

  return (
    <div className={s.container}>
      <svg
        className={s.svg}
        viewBox="0 0 300 240"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Линии от ботов к серверу */}
        {visible.map((bot, i) => {
          const angle = (2 * Math.PI * i) / visible.length - Math.PI / 2;
          const bx = cx + orbitR * Math.cos(angle);
          const by = cy + orbitR * Math.sin(angle);

          return (
            <line
              key={`line-${bot.name}`}
              x1={cx}
              y1={cy}
              x2={bx}
              y2={by}
              className={
                s.line +
                (bot.status === "active" ? " " + s.pulse : "")
              }
            />
          );
        })}

        {/* Узлы ботов */}
        {visible.map((bot, i) => {
          const angle = (2 * Math.PI * i) / visible.length - Math.PI / 2;
          const bx = cx + orbitR * Math.cos(angle);
          const by = cy + orbitR * Math.sin(angle);
          const cls = statusClass[bot.status] || s.botNodeDone;

          return (
            <circle
              key={bot.name}
              cx={bx}
              cy={by}
              r={4}
              className={s.botNode + " " + cls}
            >
              <title>
                {bot.name} — {bot.status} ({bot.messagesSent} сообщ.)
              </title>
            </circle>
          );
        })}

        {/* Узел сервера */}
        <circle cx={cx} cy={cy} r={serverR} className={s.serverNode} />
        <text x={cx} y={cy} className={s.serverLabel}>
          Сервер
        </text>
      </svg>
    </div>
  );
}
