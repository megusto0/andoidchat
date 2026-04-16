/**
 * Хук авто-скролла для области чата.
 *
 * При новых сообщениях автоматически прокручивает вниз,
 * если пользователь не прокрутил вверх больше чем на 100px.
 */
import { useEffect, useRef, useState, useCallback } from "react";

export function useAutoScroll(messagesLength: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messagesLength]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollButton(distanceFromBottom > 100);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setShowScrollButton(false);
    }
  }, []);

  return { containerRef, showScrollButton, scrollToBottom };
}
