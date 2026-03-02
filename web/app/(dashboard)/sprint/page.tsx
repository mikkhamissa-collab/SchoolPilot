"use client";

// Sprint mode — coming soon. Use the chat sidebar to ask SchoolPilot to
// create a study sprint for you.

export default function SprintPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white">Sprint Mode</h2>
      <p className="text-text-secondary">
        Big test coming up? Sprint mode helps you build a focused multi-day
        study plan with spaced repetition.
      </p>
      <div className="p-8 rounded-xl bg-bg-card border border-border text-center space-y-4">
        <div className="text-4xl">🏃</div>
        <p className="text-white font-medium">Coming Soon</p>
        <p className="text-text-muted text-sm max-w-sm mx-auto">
          Sprint mode is being rebuilt. In the meantime, open the chat sidebar
          and ask SchoolPilot to create a study plan for your upcoming test.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-chat", { detail: { message: "Help me study for my upcoming test" } }))}
          className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer"
        >
          Open Chat
        </button>
      </div>
    </div>
  );
}
