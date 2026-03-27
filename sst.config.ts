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
    // NOTE: BAML requires CGo, which doesn't cross-compile from macOS.
    // T-004 will solve this with a Docker-based build or ECR container image.
    const api = new sst.aws.Function("HmwApi", {
      handler: "backend",
      runtime: "go",
      architecture: "arm64",
      url: {
        streaming: true,
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
