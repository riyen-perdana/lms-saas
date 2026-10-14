import { createFileRoute } from "@tanstack/react-router"

import { buildSitemap, isMarketingHost, requestOrigin } from "@/lib/seo"

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isMarketingHost(request.headers.get("host"))) {
          return new Response("Not found", { status: 404 })
        }

        return new Response(buildSitemap(requestOrigin(request)), {
          headers: { "content-type": "application/xml; charset=utf-8" },
        })
      },
    },
  },
})
