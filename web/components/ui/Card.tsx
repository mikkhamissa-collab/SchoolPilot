export function Card({
  children,
  className = '',
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`bg-surface border rounded-xl p-4 ${
        glow ? 'border-accent/20 shadow-accent-glow' : 'border-border'
      } ${className}`}
    >
      {children}
    </div>
  );
}
