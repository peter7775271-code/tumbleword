type Pattern = "tap" | "success" | "error";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  success: [12, 40, 24],
  error: [40, 30, 40],
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
