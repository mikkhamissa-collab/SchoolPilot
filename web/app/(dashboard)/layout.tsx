// Dashboard layout: left sidebar + main content + right chat sidebar
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import ChatSidebar from "@/components/ChatSidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Track whether the chat sidebar is expanded so we can adjust main content margin.
  // The ChatSidebar manages its own state via localStorage; we sync via a storage event
  // and also read the initial value on mount.
  const [chatExpanded, setChatExpanded] = useState(false);

  useEffect(() => {
    // Read initial state from localStorage
    try {
      const saved = localStorage.getItem("schoolpilot_chat_expanded");
      setChatExpanded(saved === "true");
    } catch {
      // ignore
    }

    // Listen for changes from the ChatSidebar component
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "schoolpilot_chat_expanded") {
        setChatExpanded(e.newValue === "true");
      }
    };

    // Also listen for same-tab storage writes via a custom event
    const handleCustom = () => {
      try {
        const val = localStorage.getItem("schoolpilot_chat_expanded");
        setChatExpanded(val === "true");
      } catch {
        // ignore
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("schoolpilot-chat-toggle", handleCustom);

    // Poll briefly to catch the initial render sync (localStorage reads in
    // the ChatSidebar useEffect happen after mount)
    const timer = setTimeout(handleCustom, 350);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("schoolpilot-chat-toggle", handleCustom);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg-dark">
      <OfflineIndicator />
      {/* Accessibility: skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Left sidebar — fixed, 56px wide on desktop */}
      <Sidebar />

      {/* Main content — adjusts right margin when chat sidebar is open */}
      <main
        id="main-content"
        className={`md:ml-14 p-6 pb-24 md:pb-6 transition-all duration-300 ${
          chatExpanded ? "md:mr-[400px]" : "md:mr-0"
        }`}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      {/* Right chat sidebar — self-contained, 400px wide */}
      <ChatSidebar />

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
