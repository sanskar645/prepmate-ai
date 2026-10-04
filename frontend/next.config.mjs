/** @type {import('next').NextConfig} */
const nextConfig = {
  // face-api's ESM bundle uses a dynamic require() that webpack can't trace.
  // It resolves fine at runtime (models load from /public/models); this just
  // silences the "Critical dependency" noise in dev and build logs.
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /face-api/, message: /Critical dependency/ },
    ];
    return config;
  },
};

export default nextConfig;
