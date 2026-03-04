// Left sidebar navigation — collapsed icon rail on desktop (w-14), full drawer on mobile
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/today", label: "Today", icon: "🛡️" },
  { href: "/focus", label: "Focus", icon: "🎯" },
  { href: "/plan", label: "Plan", icon: "📅" },
  { href: "/sprint", label: "Sprint", icon: "⚡" },
  { href: "/grades", label: "Grades", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{
    email?: string;
    name?: string;
    avatar?: string;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Get user info for display
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser({
          email: user.email,
          name:
            user.user_metadata?.full_name || user.email?.split("@")[0],
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
          // localStorage unavailable in SSR/incognito
        }
      }
    });

    // Listen for token refreshes so extension always has a valid token
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        try {
          localStorage.setItem("schoolpilot_ext_token", session.access_token);
        } catch {
          // localStorage unavailable in SSR/incognito
        }
      } else {
        try {
          localStorage.removeItem("schoolpilot_ext_token");
        } catch {
          // localStorage unavailable in SSR/incognito
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      localStorage.removeItem("schoolpilot_ext_token");
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  };

  const handleChatToggle = () => {
    window.dispatchEvent(new CustomEvent("toggle-chat"));
  };

  return (
    <aside className="hidden md:flex flex-col w-14 h-screen bg-bg-card border-r border-border fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="flex items-center justify-center py-4 border-b border-border">
        <span className="text-lg font-bold text-white" title="SchoolPilot">
          S
        </span>
      </div>

      {/* Nav — icon-only rail */}
      <nav className="flex-1 py-3 flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center w-10 h-10 rounded-lg text-base transition-colors ${
                active
                  ? "bg-accent/15 text-accent"
                  : "text-text-secondary hover:text-white hover:bg-bg-hover"
              }`}
            >
              <span>{item.icon}</span>
            </Link>
          );
        })}

        {/* Chat toggle button */}
        <button
          onClick={handleChatToggle}
          title="Toggle Chat"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-base text-text-secondary hover:text-white hover:bg-bg-hover transition-colors cursor-pointer"
        >
          <span>💬</span>
        </button>
      </nav>

      {/* User avatar + sign out */}
      <div className="flex flex-col items-center gap-2 py-4 border-t border-border">
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={user.name || "User avatar"}
            className="w-8 h-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-semibold"
            title={user?.name || "User"}
          >
            {user?.name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="text-xs text-text-muted hover:text-error transition-colors cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
