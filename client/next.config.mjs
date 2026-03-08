/** @type {import('next').NextConfig} */
const nextConfig = {
  // 👇 Add this "webpack" block
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000, // Check for changes every 1 second
      aggregateTimeout: 300, // Delay before rebuilding
    };
    return config;
  },
};

export default nextConfig;