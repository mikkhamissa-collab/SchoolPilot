"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/plan", label: "Plan", icon: "📋" },
  { href: "/focus", label: "Focus", icon: "🎯" },
  { href: "/grades", label: "Grades", icon: "📊" },
  { href: "/study", label: "Study", icon: "📖" },
  { href: "/sprint", label: "Sprint", icon: "🏃" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-card border-t border-border z-50">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs ${
                active ? "text-accent" : "text-text-muted"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
