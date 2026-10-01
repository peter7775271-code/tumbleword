"use client";

/** Horizontal timer bar plus mm:ss readout; turns urgent in the last 10 seconds. */
export function Timer({ endsAt, durationMs, now, className = "" }: { endsAt: number; durationMs: number; now: number; className?: string }) {
  const remaining = Math.max(0, endsAt - now);
  const fraction = Math.min(1, remaining / durationMs);
  const seconds = Math.ceil(remaining / 1000);
  const urgent = seconds <= 10;
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className={`flex items-center gap-[0.6em] ${className}`}>
      <div
        className="h-[0.5em] flex-1 overflow-hidden rounded-full bg-ink-800"
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={seconds}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${urgent ? "bg-flame" : "bg-sky"}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span className={`min-w-[3ch] text-right font-black tabular-nums ${urgent ? "animate-pulse-soft text-flame" : ""}`}>{label}</span>
    </div>
  );
}
