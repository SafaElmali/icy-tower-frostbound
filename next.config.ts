import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.DEPLOY_TARGET === 'netlify' ? 'export' : undefined,
};

export default nextConfig;
