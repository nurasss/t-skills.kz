import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep CMS metadata in <head> for crawlers, previews and site verification.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
