// Endpoint Better Auth: /api/auth/* (sign-in, sign-up, sign-out, get-session, ...).

import { createFileRoute } from "@tanstack/react-router"

import { auth } from "@/lib/auth"

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})
