"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";

interface Plan {
  id: string;
  assignments: Array<{ title: string; course?: string; due?: string }>;
  ai_response: string | null;
  emailed: boolean;
  created_at: string;
}

export default function PlanPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setPlans(data);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="h-8 w-32 bg-bg-card rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Daily Plans</h2>
        <p className="text-text-secondary mt-1">
          AI-generated daily action plans from your Teamie assignments.
        </p>
      </div>

      {/* How it works */}
      <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
        <p className="text-text-secondary text-sm">
          <span className="text-accent font-medium">How it works:</span> Open Teamie in Chrome,
          click the SchoolPilot extension, and hit Sync. Your assignments will appear here, and
          AI will generate a prioritized plan and email it to you.
        </p>
      </div>

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-text-muted text-lg mb-2">No plans yet</p>
          <p className="text-text-muted text-sm">
            Sync your assignments from Teamie using the extension to generate your first plan.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const expanded = expandedId === plan.id;
            const date = new Date(plan.created_at);
            return (
              <div key={plan.id} className="rounded-xl bg-bg-card border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : plan.id)}
                  className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
                >
                  <div>
                    <p className="text-white font-medium">
                      {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="text-text-muted text-sm mt-0.5">
                      {plan.assignments.length} assignments
                      {plan.emailed && " · ✉ Emailed"}
                    </p>
                  </div>
                  <span className="text-text-muted text-xl">
                    {expanded ? "−" : "+"}
                  </span>
                </button>

                {expanded && plan.ai_response && (
                  <div className="px-4 pb-4 border-t border-border">
                    <div
                      className="mt-3 text-text-secondary text-sm leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: plan.ai_response }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
