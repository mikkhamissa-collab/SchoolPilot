"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";

interface Assignment {
  title: string;
  type?: string;
  due?: string;
  course?: string;
  date?: string;
  day?: string;
}

interface Plan {
  id: string;
  assignments: Assignment[];
  ai_response: string | null;
  emailed: boolean;
  created_at: string;
}

// Clean course name (first line only)
const cleanCourse = (c?: string) => c?.split("\n")[0]?.trim() || "";

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
      if (data) {
        setPlans(data);
        // Auto-expand the latest plan
        if (data.length > 0) setExpandedId(data[0].id);
      }
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

  // Type-based badge color
  const typeBadgeColor = (type?: string) => {
    const t = (type || "").toLowerCase();
    if (t.includes("assess") || t.includes("test") || t.includes("exam")) return "bg-error/15 text-error";
    if (t.includes("quiz")) return "bg-warning/15 text-warning";
    if (t.includes("homework") || t.includes("assignment")) return "bg-accent/15 text-accent";
    return "bg-bg-hover text-text-muted";
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Daily Plans</h2>
        <p className="text-text-secondary mt-1">
          Your synced assignments from Teamie, organized by day.
        </p>
      </div>

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="p-8 rounded-xl bg-bg-card border border-border text-center">
          <p className="text-text-muted text-lg mb-2">No plans yet</p>
          <p className="text-text-muted text-sm">
            Sync your assignments from Teamie using the extension to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const expanded = expandedId === plan.id;
            const date = new Date(plan.created_at);

            // Group this plan's assignments by date
            const grouped: Record<string, Assignment[]> = {};
            for (const a of plan.assignments) {
              const key = a.day && a.date ? `${a.day} ${a.date}` : "Upcoming";
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(a);
            }

            return (
              <div key={plan.id} className="rounded-xl bg-bg-card border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : plan.id)}
                  className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
                >
                  <div>
                    <p className="text-white font-medium">
                      {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      <span className="text-text-muted ml-2 text-sm">
                        {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
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

                {expanded && (
                  <div className="px-4 pb-4 border-t border-border">
                    {/* AI response if available */}
                    {plan.ai_response && (
                      <div
                        className="mt-3 mb-4 p-3 rounded-lg bg-accent/5 text-text-secondary text-sm leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: plan.ai_response }}
                      />
                    )}

                    {/* Assignment list */}
                    <div className="mt-3 space-y-4">
                      {Object.entries(grouped).map(([dateLabel, items]) => (
                        <div key={dateLabel}>
                          <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                            {dateLabel}
                          </p>
                          <div className="space-y-2">
                            {items.map((a, i) => (
                              <div
                                key={`${a.title}-${i}`}
                                className="flex items-center justify-between p-3 rounded-lg bg-bg-dark border border-border/50"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-white text-sm font-medium truncate">{a.title}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    {a.type && (
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColor(a.type)}`}>
                                        {a.type.split("\n")[0]}
                                      </span>
                                    )}
                                    {cleanCourse(a.course) && (
                                      <span className="text-text-muted text-xs">{cleanCourse(a.course)}</span>
                                    )}
                                  </div>
                                </div>
                                {a.due && (
                                  <span className="text-text-secondary text-xs ml-3 flex-shrink-0">{a.due}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
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
