"use client";

// Plan page — coming soon. Use the chat sidebar to ask SchoolPilot to
// create a daily plan for you.

export default function PlanPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white">Daily Plans</h2>
      <p className="text-text-secondary">
        Your AI-generated daily study plans and priorities.
      </p>
      <div className="p-8 rounded-xl bg-bg-card border border-border text-center space-y-4">
        <div className="text-4xl">📅</div>
        <p className="text-white font-medium">Coming Soon</p>
        <p className="text-text-muted text-sm max-w-sm mx-auto">
          Daily plans are being rebuilt with the new AI system. In the meantime,
          open the chat sidebar and ask SchoolPilot to plan your day.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-chat", { detail: { message: "Create a study plan for today" } }))}
          className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer"
        >
          Open Chat
        </button>
      </div>
    </div>
  );
}
