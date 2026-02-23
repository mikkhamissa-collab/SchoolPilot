"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-4">
      <div className="text-4xl">😵</div>
      <h2 className="text-xl font-bold text-white">Something went wrong</h2>
      <p className="text-text-muted text-sm">
        An unexpected error occurred. This has been logged.
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
