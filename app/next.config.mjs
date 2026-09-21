/** @type {import('next').NextConfig} */
const securityHeaders = [
  // The app is same-origin only: no third-party embeds, no inline event handlers.
  // 'unsafe-inline' for styles is required by the Tailwind runtime-free build
  // (Next injects a <style> tag per route); scripts stay strict.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Signed/derived URLs are generated server-side; only the storage host is
      // allow-listed, never an arbitrary remote origin.
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" },
    ],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/:path*.(woff2|png|jpg|jpeg|svg|webp|avif|ico)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
  /**
   * Optional webpack hash override.
   *
   * webpack's default `output.hashFunction` is `xxhash64`, which is implemented
   * in WebAssembly. Runtimes without a usable WebAssembly (this project was
   * verified end-to-end in one - see docs/06-testing.md) fail the build with
   * `TypeError: Cannot read properties of undefined (reading 'init')` inside
   * `WasmHash`. Setting EDURA_HASH_FUNCTION=sha256 uses OpenSSL's hash instead,
   * which is available everywhere. Unset in production, so a normal deployment
   * keeps webpack's faster default.
   */
  webpack(config) {
    const hashFunction = process.env.EDURA_HASH_FUNCTION?.trim();
    if (hashFunction && config.output) {
      config.output.hashFunction = hashFunction;
    }
    return config;
  },
};

export default nextConfig;
