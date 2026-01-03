/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静的エクスポート（Amplify Hosting手動デプロイ用）
  output: 'export',
  
  // 画像最適化（静的エクスポートでは無効化が必要）
  images: {
    unoptimized: true,
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
