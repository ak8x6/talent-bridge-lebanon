import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/gh-proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { method, path, body } = (await request.json()) as {
          method: string;
          path: string;
          body?: unknown;
        };
        const res = await fetch(`https://connector-gateway.lovable.dev/github/${path}`, {
          method,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
            "X-Connection-Api-Key": process.env["GITHUB_API_KEY"]!,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return new Response(await res.text(), {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
