import {
  HeadContent,
  Scripts,
  createRootRoute,
  useMatches,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import appCss from "../styles.css?url"

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Tema CSS untuk <html data-theme>; kosong = tema dashboard (preset shadcn). */
    theme?: "marketing"
  }
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "EduSaaS",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const theme = useMatches({
    select: (matches) => matches.find((m) => m.staticData.theme)?.staticData.theme,
  })

  return (
    <html lang="id" data-theme={theme}>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        {/* Tombol devtools menutupi tombol di pojok kanan bawah layar 360px,
            jadi dimatikan saat E2E (playwright.config.ts mengisi VITE_E2E). */}
        {import.meta.env.VITE_E2E ? null : (
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
