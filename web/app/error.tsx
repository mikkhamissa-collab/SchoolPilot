"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-white mb-3">
          Something went wrong
        </h1>
        <p className="text-[#a0a0b0] text-sm mb-6">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-medium transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
