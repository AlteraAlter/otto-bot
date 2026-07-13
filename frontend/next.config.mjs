import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "okb.automatonsoft.de"],
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT || "otto-bot-frontend",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
