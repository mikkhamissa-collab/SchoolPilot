// Left sidebar navigation — collapsed icon rail on desktop (w-14)
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState, type ComponentType } from "react";
import {
  SunIcon,
  ChartIcon,
  BookIcon,
  ClockIcon,
  UsersIcon,
  GearIcon,
  ChatIcon,
  LogOutIcon,
} from "@/components/icons";

const navItems: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { href: "/today", label: "Today", Icon: SunIcon },
  { href: "/grades", label: "Grades", Icon: ChartIcon },
  { href: "/study", label: "Study", Icon: BookIcon },
  { href: "/focus", label: "Focus", Icon: ClockIcon },
  { href: "/buddy", label: "Buddy", Icon: UsersIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
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

    // Listen for auth state changes (e.g., sign-out from another tab)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        // User signed out — redirect to home
        window.location.href = "/";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleChatToggle = () => {
    window.dispatchEvent(new CustomEvent("toggle-chat"));
  };

  return (
    <aside className="hidden md:flex flex-col w-14 h-screen bg-surface border-r border-border fixed left-0 top-0 z-40">
      {/* Logo — gradient square */}
      <div className="flex items-center justify-center py-4 border-b border-border">
        <div
          className="w-[22px] h-[22px] rounded-[6px]"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
          }}
          title="SchoolPilot"
        />
      </div>

      {/* Nav — icon-only rail */}
      <nav aria-label="Main navigation" className="flex-1 py-3 flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                active
                  ? "bg-accent-glow text-accent"
                  : "text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              <item.Icon className="w-5 h-5" />
            </Link>
          );
        })}

        {/* Chat toggle button */}
        <button
          onClick={handleChatToggle}
          title="Toggle Chat"
          aria-label="Toggle chat sidebar"
          className="flex items-center justify-center w-10 h-10 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <ChatIcon className="w-5 h-5" />
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
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted text-sm font-semibold"
            title={user?.name || "User"}
          >
            {user?.name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="text-muted hover:text-red transition-colors cursor-pointer"
        >
          <LogOutIcon className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
