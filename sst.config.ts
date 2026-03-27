/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "hmw-workshop",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          profile: process.env.AWS_PROFILE || "sst",
          region: "us-west-1",
        },
      },
    };
  },
  async run() {
    // Secrets
    const anthropicKey = new sst.Secret("AnthropicApiKey");

    // Go Lambda with streaming
    // Pre-built via `backend/build.sh` (zig cc cross-compiles CGo for BAML)
    const api = new sst.aws.Function("HmwApi", {
      bundle: "backend",
      handler: "bootstrap",
      runtime: "provided.al2023",
      architecture: "arm64",
      streaming: true,
      url: {
        cors: {
          allowOrigins: process.env.FRONTEND_URL
            ? [process.env.FRONTEND_URL]
            : ["*"],
          allowMethods: ["POST", "OPTIONS"],
          allowHeaders: ["Content-Type"],
        },
      },
      environment: {
        HOME: "/tmp",
        ANTHROPIC_API_KEY: anthropicKey.value,
        BAML_LIBRARY_PATH: "/var/task/libbaml_cffi-aarch64-unknown-linux-gnu.so",
      },
      link: [anthropicKey],
      timeout: "5 minutes",
      memory: "512 MB",
    });

    // TODO (T-004): Frontend deployment to Cloudflare Pages
    // SST v4 removed sst.cloudflare.SvelteKit — evaluate sst.cloudflare.StaticSite
    // with prerendered SvelteKit, or deploy via wrangler/CF dashboard directly.

    return {
      apiUrl: api.url,
    };
  },
});
