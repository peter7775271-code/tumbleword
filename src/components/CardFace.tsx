import { TIER_STYLE, type CardDefinition } from "@/lib/game/cards";

/** Tier is always shown as symbol + text, with color only as reinforcement. */
export function TierTag({ card, className = "" }: { card: CardDefinition; className?: string }) {
  const tier = TIER_STYLE[card.tier];
  return (
    <span className={`font-black uppercase tracking-widest ${className}`} style={{ color: tier.color }}>
      {tier.symbol} {tier.label}
    </span>
  );
}

export function CardFace({ card, selected = false, compact = false, className = "" }: { card: CardDefinition; selected?: boolean; compact?: boolean; className?: string }) {
  const tier = TIER_STYLE[card.tier];
  return (
    <span
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-ink-900 text-center ${compact ? "px-1 py-1" : "px-2 py-2"} ${
        selected ? "-translate-y-1 shadow-[0_0.4rem_0_rgb(0_0_0/0.35)]" : ""
      } transition-transform ${className}`}
      style={{ borderColor: tier.color, background: selected ? `color-mix(in srgb, ${tier.color} 22%, #121a3d)` : undefined }}
    >
      <span className={compact ? "text-xl leading-none" : "text-3xl leading-none"} aria-hidden>
        {card.emoji}
      </span>
      {!compact && <span className="text-xs font-black leading-tight">{card.name}</span>}
      <span className="text-[0.6rem] font-black uppercase tracking-widest" style={{ color: tier.color }}>
        {tier.symbol}
        {!compact && ` ${tier.label}`}
      </span>
    </span>
  );
}
