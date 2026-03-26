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
      <div className="w-16 h-16 mx-auto rounded-2xl bg-red/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-red" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
      </div>
      <h2 className="text-xl font-bold text-text">Something went wrong</h2>
      <p className="text-muted text-sm">
        An unexpected error occurred. This has been logged.
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-lg bg-accent hover:opacity-85 text-text font-medium transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
