'use client';

export function ThinkingDots() {
  return (
    <div className="flex items-center gap-[5px]">
      <span
        className="block w-[5px] h-[5px] rounded-full bg-accent-light animate-[pulse3_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: '0s' }}
      />
      <span
        className="block w-[5px] h-[5px] rounded-full bg-accent-light animate-[pulse3_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: '0.2s' }}
      />
      <span
        className="block w-[5px] h-[5px] rounded-full bg-accent-light animate-[pulse3_1.4s_ease-in-out_infinite]"
        style={{ animationDelay: '0.4s' }}
      />
    </div>
  );
}

export function ThinkingOrb() {
  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-accent-light animate-[breathe_2s_ease-in-out_infinite] flex-shrink-0" />
  );
}

export function ShimmerLine() {
  return (
    <div
      className="h-px w-full animate-[shimmer_3s_ease-in-out_infinite]"
      style={{
        backgroundImage: 'linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.25), transparent)',
        backgroundSize: '200% 100%',
      }}
    />
  );
}

export function StreamingCursor() {
  return (
    <span className="inline-block w-[2px] h-4 bg-accent-light animate-[cursorBlink_0.8s_step-end_infinite] align-text-bottom" />
  );
}

export function SkeletonPulse({
  className = '',
  width,
  height,
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={`rounded-lg bg-surface animate-[skeletonPulse_2s_ease-in-out_infinite] ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4">
      <SkeletonPulse width="6rem" height="1rem" />
      <SkeletonPulse width="4rem" height="1rem" />
    </div>
  );
}
