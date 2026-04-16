import type { SimMetrics } from "../hooks/useSimulation";
import s from "./MetricsGrid.module.css";

interface Props {
  metrics: SimMetrics;
}

export function MetricsGrid({ metrics }: Props) {
  const hasErrors = metrics.failedConnections > 0 || metrics.incorrectResponses > 0;

  const items = [
    { label: "Активных клиентов", value: metrics.activeClients, good: true },
    { label: "Всего подключений", value: metrics.totalConnected, good: metrics.totalConnected >= 50 },
    { label: "Ошибок подключения", value: metrics.failedConnections, good: metrics.failedConnections === 0 },
    { label: "Отправлено ботами", value: metrics.messagesSent, good: true },
    {
      label: "Доставлено пакетов",
      value: metrics.messagesReceived,
      good: metrics.messagesReceived > 0 || metrics.messagesSent === 0,
    },
    { label: "Подтверждено эхо", value: metrics.echoConfirmed, good: true },
    {
      label: "Подтверждено ответов сервера",
      value: metrics.serverResponsesConfirmed,
      good: true,
    },
    { label: "Ошибок проверки", value: metrics.incorrectResponses, good: metrics.incorrectResponses === 0 },
    { label: "Среднее время ответа", value: `${metrics.avgResponseMs.toFixed(1)} мс`, good: !hasErrors },
    { label: "Пакетов/сек", value: metrics.messagesPerSecond.toFixed(1), good: true },
  ];

  return (
    <div className={s.grid}>
      {items.map((item) => (
        <div className={s.card} key={item.label}>
          <span
            className={
              s.value +
              (item.good ? " " + s.valueGood : " " + s.valueBad)
            }
          >
            {item.value}
          </span>
          <span className={s.label}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
