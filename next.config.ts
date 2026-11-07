// The Next.js config (#26). The app opens on the Overview. agentRules off stops next dev writing AGENTS.md.

import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  async redirects() {
    return [{ source: "/", destination: "/overview", permanent: false }];
  },
};

export default config;
