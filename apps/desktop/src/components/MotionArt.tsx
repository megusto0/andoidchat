import s from "./MotionArt.module.css";

interface DiscoveryRadarProps {
  state: "idle" | "searching" | "found" | "not_found";
}

export function AnimatedLogo() {
  return (
    <div className={s.logoScene} aria-hidden="true">
      <span className={`${s.packet} ${s.packetA}`} />
      <span className={`${s.packet} ${s.packetB}`} />
      <span className={`${s.packet} ${s.packetC}`} />
      <span className={`${s.packet} ${s.packetD}`} />
      <span className={`${s.packet} ${s.packetE}`} />
      <span className={`${s.packet} ${s.packetF}`} />
      <span className={s.logoGlow} />
      <div className={s.logoShell}>
        <svg
          className={s.logoBubble}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H9l-4 4v-4H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className={`${s.logoDot} ${s.logoDot1}`} />
        <span className={`${s.logoDot} ${s.logoDot2}`} />
        <span className={`${s.logoDot} ${s.logoDot3}`} />
      </div>
    </div>
  );
}

export function DiscoveryRadar({ state }: DiscoveryRadarProps) {
  const stateClass =
    state === "found"
      ? s.radarFound
      : state === "searching"
        ? ""
        : s.radarIdle;

  return (
    <div
      className={`${s.radar} ${stateClass}`.trim()}
      aria-hidden="true"
    >
      <span className={s.radarRing} />
      <span className={s.radarRingLarge} />
      <span className={s.radarSweep} />
      <span className={s.radarPulse} />
      <span className={s.radarPulseLarge} />
      <span className={s.radarCenter} />
    </div>
  );
}
