"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/today", label: "Today", icon: "🛡️" },
  { href: "/grades", label: "Grades", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string; name?: string; avatar?: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Get user info for display
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          email: user.email,
          name: user.user_metadata?.full_name || user.email?.split("@")[0],
          avatar: user.user_metadata?.avatar_url,
        });
      }
    });
    // Write access token to localStorage so the Chrome extension can read it
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        try {
          localStorage.setItem("schoolpilot_ext_token", session.access_token);
        } catch {
          // Ignore localStorage errors
        }
      }
    });
    // Listen for token refreshes so extension always has a valid token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        try {
          localStorage.setItem("schoolpilot_ext_token", session.access_token);
        } catch {
          // Ignore
        }
      } else {
        try {
          localStorage.removeItem("schoolpilot_ext_token");
        } catch {
          // Ignore
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    try { localStorage.removeItem("schoolpilot_ext_token"); } catch { /* ignore */ }
    window.location.href = "/";
  };

  return (
    <aside className="hidden md:flex flex-col w-56 h-screen bg-bg-card border-r border-border fixed left-0 top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <h1 className="text-lg font-bold text-white">SchoolPilot</h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-accent/15 text-accent"
                  : "text-text-secondary hover:text-white hover:bg-bg-hover"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt=""
              className="w-8 h-8 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-semibold">
              {user?.name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.name || "Loading..."}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs text-text-muted hover:text-error transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
