/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Static Export: API Routes are not supported
  // CopilotKit connects directly to external AG-UI endpoint
}

module.exports = nextConfig



