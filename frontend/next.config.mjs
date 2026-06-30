/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "okb.automatonsoft.de"],
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
