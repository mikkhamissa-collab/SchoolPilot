import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Only wrap with Sentry in production builds (Turbopack doesn't support Sentry's webpack plugin)
const config =
  process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SENTRY_DSN
    ? withSentryConfig(nextConfig, {
        silent: true,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      })
    : nextConfig;

export default config;
