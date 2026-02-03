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

export default function DashboardPage() {
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [stats, setStats] = useState<DashStats>({
    courseCount: 0, activeSprint: null, recentPlanDate: null,
    upcomingCount: 0, overdueCount: 0,
  });
  const [upcoming, setUpcoming] = useState<Assignment[]>([]);
  const [overdue, setOverdue] = useState<Assignment[]>([]);
  const [courseNames, setCourseNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUser({ name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Student" });

      const [coursesRes, sprints, plans, assignmentsRes] = await Promise.all([
        supabase.from("courses").select("id, name").eq("user_id", user.id),
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
