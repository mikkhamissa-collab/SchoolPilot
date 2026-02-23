// Dashboard layout with sidebar + mobile nav
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-dark">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>
      <Sidebar />
      <main id="main-content" className="md:ml-56 p-6 pb-24 md:pb-6">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
