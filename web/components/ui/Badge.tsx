const colorMap: Record<string, string> = {
  accent: '#7c3aed',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  muted: '#71717a',
};

export function Badge({
  children,
  color = 'accent',
}: {
  children: React.ReactNode;
  color?: 'accent' | 'green' | 'red' | 'amber' | 'muted';
}) {
  const hex = colorMap[color];

  return (
    <span
      className="px-2 py-[2px] rounded-md text-[11px] font-semibold tracking-wide"
      style={{
        background: `${hex}18`,
        color: hex,
      }}
    >
      {children}
    </span>
  );
}
