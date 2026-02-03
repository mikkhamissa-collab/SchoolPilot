"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Assignment {
  title: string;
  type?: string;
  due?: string;
  course?: string;
  date?: string;
  day?: string;
  isOverdue?: boolean;
}

interface DashStats {
  courseCount: number;
  activeSprint: string | null;
  recentPlanDate: string | null;
  upcomingCount: number;
  overdueCount: number;
}

interface CourseImportance {
  [courseName: string]: number; // 1-5, higher = more important
}

// Parse date string like "03" (day number) or full date
function parseDateNum(dateStr?: string, dayStr?: string): Date | null {
  if (!dateStr) return null;
  const now = new Date();
  const dayNum = parseInt(dateStr, 10);
  if (isNaN(dayNum)) return null;

  // Assume current month/year, but if day is less than today, assume next month
  let targetDate = new Date(now.getFullYear(), now.getMonth(), dayNum);
  if (targetDate < now) {
    targetDate = new Date(now.getFullYear(), now.getMonth() + 1, dayNum);
  }
  return targetDate;
}

// Calculate urgency score: higher = more urgent (due sooner + higher type weight + importance)
function getUrgencyScore(
  a: Assignment,
  importance: CourseImportance
): number {
  const now = new Date();
  const dueDate = parseDateNum(a.date, a.day);

  // Days until due (0 = today, negative = overdue)
  let daysUntil = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 14;
  if (a.isOverdue) daysUntil = -1;

  // Time urgency: exponential decay (items due sooner get much higher scores)
  const timeScore = Math.max(0, 100 - daysUntil * 10);

  // Type weight: assessments/tests > quizzes > assignments > tasks
  const typeStr = (a.type || "").toLowerCase();
  let typeScore = 10;
  if (typeStr.includes("assess") || typeStr.includes("test") || typeStr.includes("exam") || typeStr.includes("offline")) {
    typeScore = 50; // High-stakes
  } else if (typeStr.includes("quiz")) {
    typeScore = 30;
  } else if (typeStr.includes("assignment")) {
    typeScore = 20;
  }

  // Course importance (1-5 scale, default 3)
  const courseName = a.course?.split("\n")[0]?.trim() || "";
  const courseScore = (importance[courseName] || 3) * 5;

  // Overdue penalty (push these to top)
  const overdueBonus = a.isOverdue ? 100 : 0;

  return timeScore + typeScore + courseScore + overdueBonus;
}

// Filter to only high-stakes items (assessments, tests, quizzes)
function isHighStakes(a: Assignment): boolean {
  const typeStr = (a.type || "").toLowerCase();
  return (
    typeStr.includes("assess") ||
    typeStr.includes("test") ||
    typeStr.includes("exam") ||
    typeStr.includes("quiz") ||
    typeStr.includes("offline")
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [stats, setStats] = useState<DashStats>({
    courseCount: 0, activeSprint: null, recentPlanDate: null,
    upcomingCount: 0, overdueCount: 0,
  });
  const [upcoming, setUpcoming] = useState<Assignment[]>([]);
  const [overdue, setOverdue] = useState<Assignment[]>([]);
  const [mostPressing, setMostPressing] = useState<Assignment[]>([]);
  const [courseNames, setCourseNames] = useState<string[]>([]);
  const [courseImportance, setCourseImportance] = useState<CourseImportance>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUser({ name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Student" });

      const [coursesRes, sprints, plans, assignmentsRes] = await Promise.all([
        supabase.from("courses").select("id, name, policies").eq("user_id", user.id),
        supabase.from("sprints").select("test_name").eq("user_id", user.id).eq("completed", false).limit(1),
        supabase.from("plans").select("created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("scraped_assignments").select("assignments").eq("user_id", user.id).order("scraped_at", { ascending: false }).limit(1),
      ]);

      // Handle both old format (flat array) and new format ({ upcoming, overdue, ... })
      const rawData = assignmentsRes.data?.[0]?.assignments;
      let upcomingList: Assignment[] = [];
      let overdueList: Assignment[] = [];

      if (Array.isArray(rawData)) {
        // Old format: flat array
        upcomingList = rawData;
      } else if (rawData && typeof rawData === "object") {
        // New format: { upcoming: [], overdue: [], newsfeed: [], stats: {} }
        upcomingList = rawData.upcoming || [];
        overdueList = rawData.overdue || [];
      }

      // Deduplicate
      const dedup = (items: Assignment[]) => {
        const seen = new Set<string>();
        return items.filter((a) => {
          const key = `${a.title}|${a.course || ""}|${a.date || ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      upcomingList = dedup(upcomingList);
      overdueList = dedup(overdueList);

      const courseList = coursesRes.data || [];
      setCourseNames(courseList.map((c: { name: string }) => c.name));
      setUpcoming(upcomingList);
      setOverdue(overdueList);

      // Load course importance from policies
      const importanceMap: CourseImportance = {};
      for (const c of courseList) {
        const policies = c.policies as { importance?: number } | null;
        if (policies?.importance) {
          importanceMap[c.name] = policies.importance;
        }
      }
      setCourseImportance(importanceMap);

      // Calculate Most Pressing: top 2 high-stakes items sorted by urgency
      const allItems = [...overdueList, ...upcomingList];
      const highStakes = allItems.filter(isHighStakes);
      const sorted = highStakes.sort((a, b) =>
        getUrgencyScore(b, importanceMap) - getUrgencyScore(a, importanceMap)
      );
      setMostPressing(sorted.slice(0, 2));

      setStats({
        courseCount: courseList.length,
        activeSprint: sprints.data?.[0]?.test_name || null,
        recentPlanDate: plans.data?.[0]?.created_at || null,
        upcomingCount: upcomingList.length,
        overdueCount: overdueList.length,
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-bg-card rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const cleanCourse = (c?: string) => c?.split("\n")[0]?.trim() || "";

  // Group assignments by date
  const groupByDate = (items: Assignment[]) => {
    const grouped: Record<string, Assignment[]> = {};
    for (const a of items) {
      const key = a.day && a.date ? `${a.day} ${a.date}` : "Upcoming";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    }
    return grouped;
  };

  const typeBadgeColor = (type?: string) => {
    const t = (type || "").toLowerCase();
    if (t.includes("assess") || t.includes("test") || t.includes("exam") || t.includes("offline")) return "bg-error/15 text-error";
    if (t.includes("quiz")) return "bg-warning/15 text-warning";
    if (t.includes("assignment")) return "bg-accent/15 text-accent";
    if (t.includes("task")) return "bg-blue-500/15 text-blue-400";
    return "bg-bg-hover text-text-muted";
  };

  const renderAssignment = (a: Assignment, i: number, isOverdue = false) => (
    <div
      key={`${a.title}-${i}`}
      className={`flex items-center justify-between p-3 rounded-xl border ${
        isOverdue ? "bg-error/5 border-error/20" : "bg-bg-card border-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-medium truncate">{a.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {a.type && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColor(a.type)}`}>
              {a.type.split("\n")[0]}
            </span>
          )}
          {isOverdue && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-error/20 text-error">
              Overdue
            </span>
          )}
          {cleanCourse(a.course) && (
            <span className="text-text-muted text-xs truncate">{cleanCourse(a.course)}</span>
          )}
        </div>
      </div>
      {a.due && (
        <span className={`text-xs ml-3 flex-shrink-0 ${isOverdue ? "text-error" : "text-text-secondary"}`}>
          {a.due}
        </span>
      )}
    </div>
  );

  const hasData = upcoming.length > 0 || overdue.length > 0;

  const statCards = [
    { label: "Courses", value: stats.courseCount, icon: "📊", href: "/grades", color: "text-accent" },
    { label: "Upcoming", value: stats.upcomingCount, icon: "📅", href: "/plan", color: "text-warning" },
    { label: "Overdue", value: stats.overdueCount, icon: "🔴", href: "/plan", color: stats.overdueCount > 0 ? "text-error" : "text-text-muted" },
    {
      label: "Active Sprint",
      value: stats.activeSprint ? "Active" : "None",
      icon: "🏃",
      href: "/sprint",
      color: stats.activeSprint ? "text-success" : "text-text-muted",
      sub: stats.activeSprint,
    },
  ];

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          Hey, {user?.name?.split(" ")[0]} 👋
        </h2>
        <p className="text-text-secondary mt-1">Here&apos;s your overview.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="p-4 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-muted text-sm">{s.label}</span>
              <span className="text-xl">{s.icon}</span>
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            {s.sub && <p className="text-text-muted text-xs mt-1 truncate">{s.sub}</p>}
          </Link>
        ))}
      </div>

      {/* Your Courses */}
      {courseNames.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Your Courses</h3>
          <div className="flex flex-wrap gap-2">
            {courseNames.map((name) => (
              <Link key={name} href="/grades"
                className="px-4 py-2 rounded-lg bg-bg-card border border-border text-sm text-white hover:border-accent/30 transition-colors"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Most Pressing - Top 2 urgent tests/assessments */}
      {mostPressing.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-xl">🔥</span> Most Pressing
            </h3>
            <span className="text-xs text-text-muted">Top {mostPressing.length} urgent</span>
          </div>
          <div className="space-y-3">
            {mostPressing.map((a, i) => {
              const dueDate = parseDateNum(a.date, a.day);
              const now = new Date();
              const daysUntil = dueDate
                ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const isUrgent = a.isOverdue || (daysUntil !== null && daysUntil <= 2);

              return (
                <div
                  key={`pressing-${a.title}-${i}`}
                  className={`p-4 rounded-xl border-2 ${
                    a.isOverdue
                      ? "bg-error/10 border-error/40"
                      : isUrgent
                      ? "bg-warning/10 border-warning/40"
                      : "bg-accent/10 border-accent/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {a.type && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColor(a.type)}`}>
                            {a.type.split("\n")[0]}
                          </span>
                        )}
                        {cleanCourse(a.course) && (
                          <span className="text-text-muted text-xs truncate">{cleanCourse(a.course)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {a.isOverdue ? (
                        <span className="px-3 py-1 rounded-lg text-sm font-bold bg-error/20 text-error">
                          OVERDUE
                        </span>
                      ) : daysUntil !== null ? (
                        <div>
                          <span className={`text-2xl font-bold ${isUrgent ? "text-warning" : "text-accent"}`}>
                            {daysUntil}
                          </span>
                          <span className="text-text-muted text-xs block">
                            {daysUntil === 1 ? "day" : "days"}
                          </span>
                        </div>
                      ) : a.due ? (
                        <span className="text-text-secondary text-sm">{a.due}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
                    <Link
                      href="/sprint"
                      className="text-xs text-accent hover:underline flex items-center gap-1"
                    >
                      🏃 Start Sprint
                    </Link>
                    <Link
                      href="/study"
                      className="text-xs text-accent hover:underline flex items-center gap-1"
                    >
                      📖 Study Guide
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overdue Assignments */}
      {overdue.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-error mb-3">
            Overdue ({overdue.length})
          </h3>
          <div className="space-y-2">
            {overdue.map((a, i) => renderAssignment(a, i, true))}
          </div>
        </div>
      )}

      {/* Upcoming Assignments */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Upcoming</h3>
          <div className="space-y-4">
            {Object.entries(groupByDate(upcoming)).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                  {dateLabel}
                </p>
                <div className="space-y-2">
                  {items.map((a, i) => renderAssignment(a, i))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data — sync instructions */}
      {!hasData && (
        <div className="p-6 rounded-xl bg-accent/5 border border-accent/20">
          <h3 className="text-lg font-semibold text-white mb-3">Sync Your Assignments</h3>
          <p className="text-text-secondary text-sm mb-4">
            Your dashboard will show your classes and upcoming work once you sync from Teamie.
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">1</span>
              <p className="text-text-secondary text-sm">Make sure you&apos;re signed in here at schoolpilot.co</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">2</span>
              <p className="text-text-secondary text-sm">Go to <span className="text-white">lms.asl.org/dash</span> in Chrome</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">3</span>
              <p className="text-text-secondary text-sm">Click the SchoolPilot extension and hit <span className="text-accent font-medium">&quot;Sync to schoolpilot.co&quot;</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link href="/focus" className="flex items-center gap-3 p-4 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-white font-medium">Break down an assignment</p>
              <p className="text-text-muted text-sm">Get actionable chunks</p>
            </div>
          </Link>
          <Link href="/study" className="flex items-center gap-3 p-4 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors">
            <span className="text-2xl">📖</span>
            <div>
              <p className="text-white font-medium">Generate a study guide</p>
              <p className="text-text-muted text-sm">AI-powered study material</p>
            </div>
          </Link>
          <Link href="/sprint" className="flex items-center gap-3 p-4 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors">
            <span className="text-2xl">🏃</span>
            <div>
              <p className="text-white font-medium">Start a study sprint</p>
              <p className="text-text-muted text-sm">7-day test prep plan</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
