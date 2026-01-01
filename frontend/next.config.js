/** @type {import('next').NextConfig} */
const nextConfig = {
  // Amplify Hosting は SSR をサポートするため static export は不要
  // output: 'export',
  
  // 画像最適化（Amplify Hosting対応）
  images: {
    unoptimized: false,
  },

  // 環境変数
  env: {
    NEXT_PUBLIC_APP_NAME: 'rd-bedrock-nova',
  },

  // Webpack 設定（Amplify SDK対応）
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
