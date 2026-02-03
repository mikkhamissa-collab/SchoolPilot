"use client";

import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  courseCount: number;
  activeSprint: string | null;
  recentPlanDate: string | null;
  upcomingCount: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [stats, setStats] = useState<Stats>({
    courseCount: 0,
    activeSprint: null,
    recentPlanDate: null,
    upcomingCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUser({ name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Student" });

      // Fetch stats in parallel
      const [courses, sprints, plans, assignments] = await Promise.all([
        supabase.from("courses").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("sprints").select("test_name").eq("user_id", user.id).eq("completed", false).limit(1),
        supabase.from("plans").select("created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("scraped_assignments").select("assignments").eq("user_id", user.id).order("scraped_at", { ascending: false }).limit(1),
      ]);

      const assignmentList = assignments.data?.[0]?.assignments;
      setStats({
        courseCount: courses.count || 0,
        activeSprint: sprints.data?.[0]?.test_name || null,
        recentPlanDate: plans.data?.[0]?.created_at || null,
        upcomingCount: Array.isArray(assignmentList) ? assignmentList.length : 0,
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

  const statCards = [
    { label: "Courses", value: stats.courseCount, icon: "📊", href: "/grades", color: "text-accent" },
    {
      label: "Upcoming",
      value: stats.upcomingCount,
      icon: "📅",
      href: "/plan",
      color: "text-warning",
    },
    {
      label: "Active Sprint",
      value: stats.activeSprint ? "Active" : "None",
      icon: "🏃",
      href: "/sprint",
      color: stats.activeSprint ? "text-success" : "text-text-muted",
      sub: stats.activeSprint,
    },
    {
      label: "Last Plan",
      value: stats.recentPlanDate
        ? new Date(stats.recentPlanDate).toLocaleDateString()
        : "Never",
      icon: "📋",
      href: "/plan",
      color: stats.recentPlanDate ? "text-accent" : "text-text-muted",
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
            {s.sub && (
              <p className="text-text-muted text-xs mt-1 truncate">{s.sub}</p>
            )}
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link
            href="/focus"
            className="flex items-center gap-3 p-4 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors"
          >
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-white font-medium">Break down an assignment</p>
              <p className="text-text-muted text-sm">Get actionable chunks</p>
            </div>
          </Link>
          <Link
            href="/study"
            className="flex items-center gap-3 p-4 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors"
          >
            <span className="text-2xl">📖</span>
            <div>
              <p className="text-white font-medium">Generate a study guide</p>
              <p className="text-text-muted text-sm">AI-powered study material</p>
            </div>
          </Link>
          <Link
            href="/sprint"
            className="flex items-center gap-3 p-4 rounded-xl bg-bg-card border border-border hover:border-accent/30 transition-colors"
          >
            <span className="text-2xl">🏃</span>
            <div>
              <p className="text-white font-medium">Start a study sprint</p>
              <p className="text-text-muted text-sm">7-day test prep plan</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Getting Started — show when no courses exist */}
      {stats.courseCount === 0 && (
        <div className="p-6 rounded-xl bg-accent/5 border border-accent/20">
          <h3 className="text-lg font-semibold text-white mb-4">Get Started</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">1</span>
              <div>
                <p className="text-white font-medium">Add your courses</p>
                <p className="text-text-secondary text-sm">Go to the <Link href="/grades" className="text-accent hover:underline">Grades</Link> page and add your courses with grade categories (Tests, Homework, etc.).</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">2</span>
              <div>
                <p className="text-white font-medium">Sync from Teamie (optional)</p>
                <p className="text-text-secondary text-sm">Use the SchoolPilot Chrome extension on <span className="text-text-primary">lms.asl.org</span> to sync your assignments automatically.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">3</span>
              <div>
                <p className="text-white font-medium">Use AI features</p>
                <p className="text-text-secondary text-sm">Break down assignments, generate study guides, and create sprint plans.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
