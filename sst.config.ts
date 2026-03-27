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
      url: {
        streaming: true,
      },
      environment: {
        HOME: "/tmp",
        ANTHROPIC_API_KEY: anthropicKey.value,
      },
      link: [anthropicKey],
      timeout: "5 minutes",
      memory: "512 MB",
      transform: {
        url: (args) => {
          // SST sets BUFFERED for custom runtimes; override for SSE streaming
          args.invokeMode = "RESPONSE_STREAM";
        },
      },
    });

    // TODO (T-004): Frontend deployment to Cloudflare Pages
    // SST v4 removed sst.cloudflare.SvelteKit — evaluate sst.cloudflare.StaticSite
    // with prerendered SvelteKit, or deploy via wrangler/CF dashboard directly.

    return {
      apiUrl: api.url,
    };
  },
});
