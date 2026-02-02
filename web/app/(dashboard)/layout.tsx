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
      <Sidebar />
      <main className="md:ml-56 p-6 pb-24 md:pb-6">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
