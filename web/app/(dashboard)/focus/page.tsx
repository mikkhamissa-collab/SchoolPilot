"use client";

// Focus mode — coming soon. Use the chat sidebar to ask SchoolPilot to
// break down an assignment for you.

export default function FocusPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white">Focus Mode</h2>
      <p className="text-text-secondary">
        Break a big assignment into small, manageable chunks with time
        estimates.
      </p>
      <div className="p-8 rounded-xl bg-bg-card border border-border text-center space-y-4">
        <div className="text-4xl">🎯</div>
        <p className="text-white font-medium">Coming Soon</p>
        <p className="text-text-muted text-sm max-w-sm mx-auto">
          Focus mode is being rebuilt. In the meantime, open the chat sidebar
          and ask SchoolPilot to break down your assignment.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-chat", { detail: { message: "Break down this assignment for me" } }))}
          className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer"
        >
          Open Chat
        </button>
      </div>
    </div>
  );
}
