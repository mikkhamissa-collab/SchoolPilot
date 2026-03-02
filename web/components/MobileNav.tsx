// Mobile bottom navigation bar — visible on small screens only (md:hidden)
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/today", label: "Today", icon: "🛡️" },
  { href: "/grades", label: "Grades", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function MobileNav() {
  const pathname = usePathname();

  const handleChatToggle = () => {
    window.dispatchEvent(new CustomEvent("toggle-chat"));
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-card border-t border-border z-50"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors ${
                active ? "text-accent" : "text-text-muted"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Chat toggle */}
        <button
          onClick={handleChatToggle}
          className="flex flex-col items-center gap-0.5 px-2 py-1 text-xs text-text-muted hover:text-accent transition-colors cursor-pointer"
        >
          <span className="text-lg">💬</span>
          <span>Chat</span>
        </button>
      </div>
    </nav>
  );
}
