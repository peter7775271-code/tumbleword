type Pattern = "tap" | "success" | "error" | "card" | "hit" | "play";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  success: [12, 40, 24],
  error: [40, 30, 40],
  card: [10, 30, 10, 30, 30],
  hit: [60, 40, 90],
  play: [20, 20, 50],
};

export function vibrate(pattern: Pattern): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(PATTERNS[pattern]);
    } catch {
      // some browsers throw when called without a user gesture
    }
  }
}
