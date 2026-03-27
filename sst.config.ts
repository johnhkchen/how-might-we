/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "hmw-workshop",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // Secrets
    const anthropicKey = new sst.Secret("AnthropicApiKey");

    // Go Lambda with streaming
    const api = new sst.aws.Function("HmwApi", {
      handler: "backend",
      runtime: "go",
      url: {
        streaming: true,
      },
      link: [anthropicKey],
      timeout: "5 minutes",
      memory: "512 MB",
    });

    // SvelteKit frontend on Cloudflare
    const site = new sst.cloudflare.SvelteKit("HmwFrontend", {
      path: "frontend",
      environment: {
        PUBLIC_API_URL: api.url,
      },
    });

    return {
      apiUrl: api.url,
      siteUrl: site.url,
    };
  },
});
