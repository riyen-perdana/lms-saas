import { createFileRoute } from "@tanstack/react-router"

import { buildRobots, isMarketingHost, requestOrigin } from "@/lib/seo"

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(
          buildRobots(
            requestOrigin(request),
            isMarketingHost(request.headers.get("host"))
          ),
          { headers: { "content-type": "text/plain; charset=utf-8" } }
        ),
    },
  },
})
