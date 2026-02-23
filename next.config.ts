import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    resolveAlias: {
      yjs: "./node_modules/yjs/dist/yjs.mjs",
      lib0: "./node_modules/lib0/index.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      yjs: path.resolve(__dirname, "node_modules/yjs/dist/yjs.mjs"),
      lib0: path.resolve(__dirname, "node_modules/lib0"),
    };
    return config;
  },
};

export default nextConfig;
