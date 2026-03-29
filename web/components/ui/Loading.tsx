// Shared loading/animation components — used across the app for consistent AI UX.

/** Three small dots that pulse sequentially. Used for AI thinking states. */
export function ThinkingDots({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-[5px] ${className}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-accent-light"
          style={{ animation: `pulse3 1.4s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

/** 28px gradient circle with breathing box-shadow animation. AI avatar. */
export function ThinkingOrb({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`rounded-full shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-light))",
        animation: "breathe 2s ease-in-out infinite",
      }}
    />
  );
}

/** Horizontal line with sliding gradient shimmer. Section divider during load. */
export function GlowDivider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-px w-full ${className}`}
      style={{
        background: "linear-gradient(90deg, transparent, var(--color-accent-glow), transparent)",
        backgroundSize: "200% 100%",
        animation: "shimmer 3s ease-in-out infinite",
      }}
    />
  );
}

/** Compact colored badge for grade alerts, statuses, etc. */
export function Badge({
  children,
  color = "accent",
  className = "",
}: {
  children: React.ReactNode;
  color?: "accent" | "green" | "red" | "amber" | "muted";
  className?: string;
}) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    accent: { bg: "rgba(124, 58, 237, 0.1)", text: "var(--color-accent)" },
    green: { bg: "rgba(34, 197, 94, 0.1)", text: "var(--color-green)" },
    red: { bg: "rgba(239, 68, 68, 0.1)", text: "var(--color-red)" },
    amber: { bg: "rgba(245, 158, 11, 0.1)", text: "var(--color-amber)" },
    muted: { bg: "rgba(113, 113, 122, 0.1)", text: "var(--color-muted)" },
  };

  const c = colorMap[color] || colorMap.accent;

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${className}`}
      style={{ background: c.bg, color: c.text }}
    >
      {children}
    </span>
  );
}
