import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dictionary is read from disk at runtime, so make sure it ships with the API functions.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/enable1.txt"],
  },
};

export default nextConfig;
