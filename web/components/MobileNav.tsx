// Mobile bottom navigation bar — visible on small screens only (md:hidden)
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType } from "react";
import {
  SunIcon,
  ChartIcon,
  BookIcon,
  ClockIcon,
  UsersIcon,
  ChatIcon,
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
];

export default function MobileNav() {
  const pathname = usePathname();

  const handleChatToggle = () => {
    window.dispatchEvent(new CustomEvent("toggle-chat"));
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-50"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-2 h-full text-xs transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <item.Icon className="w-5 h-5" />
              <span>{item.label}</span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}

        {/* Chat toggle */}
        <button
          onClick={handleChatToggle}
          aria-label="Toggle chat"
          className="relative flex flex-col items-center justify-center gap-0.5 px-2 h-full text-xs text-muted hover:text-accent transition-colors cursor-pointer"
        >
          <ChatIcon className="w-5 h-5" />
          <span>Chat</span>
        </button>
      </div>
    </nav>
  );
}
