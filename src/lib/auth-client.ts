// Client Better Auth untuk browser. Tanpa `baseURL`: request memakai origin
// halaman saat ini, sehingga login di subdomain sekolah menembak endpoint
// subdomain itu sendiri dan cookie-nya tetap host-only.

import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
