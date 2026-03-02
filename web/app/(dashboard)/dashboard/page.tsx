"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Old dashboard page — redirects to Today (the new default view)
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/today"); }, [router]);
  return null;
}
