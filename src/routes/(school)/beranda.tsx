// Beranda sekolah (sementara). Dashboard sekolah penuh dikerjakan di F2+;
// halaman ini menjadi tujuan setelah login supaya alur masuk tidak buntu.

import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router"

import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { getAccess } from "@/features/auth/server/access"
import { listMyChildrenFn } from "@/features/parent-link/server/parent-link"
import { signOut } from "@/lib/auth-client"

export const Route = createFileRoute("/(school)/beranda")({
  beforeLoad: async () => {
    const { area, schoolName, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.setupPending) throw redirect({ to: "/setup" })

    return {
      schoolName: schoolName ?? "Sekolah",
      user: access.user,
      role: access.role,
    }
  },
  loader: async ({ context }) => ({
    children: context.role === "parent" ? await listMyChildrenFn() : [],
  }),
  head: () => ({ meta: [{ title: "Beranda — EduSaaS" }] }),
  component: SchoolHome,
})

const ROLE_LABELS: Record<string, string> = {
  school_admin: "Admin sekolah",
  teacher: "Guru",
  student: "Siswa",
  parent: "Orang tua",
}

function SchoolHome() {
  const { schoolName, user, role } = Route.useRouteContext()
  const { children } = Route.useLoaderData()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  async function onSignOut() {
    setLeaving(true)
    try {
      await signOut()
      await navigate({ to: "/login" })
    } finally {
      setLeaving(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <PageHeader
        title={schoolName}
        description={`Masuk sebagai ${user.name} · ${ROLE_LABELS[role] ?? role}`}
        actions={
          <Button
            variant="outline"
            className="rounded-md"
            onClick={onSignOut}
            disabled={leaving}
          >
            Keluar
          </Button>
        }
      />
      <p className="rounded-md border border-border p-4 text-ds-body text-muted-foreground">
        Dashboard sekolah sedang dikembangkan. Kelas, materi, tugas, dan ujian
        akan tersedia di sini pada tahap berikutnya.
      </p>
      {role === "parent" ? (
        <section className="flex flex-col gap-2" aria-label="Anak Anda">
          <h2 className="text-ds-body font-medium">Anak Anda</h2>
          {children.length === 0 ? (
            <p className="text-ds-meta text-muted-foreground">
              Belum ada anak yang tertaut.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {children.map((child) => (
                <li key={child.studentId} className="flex flex-col px-3 py-2">
                  <span className="text-ds-table">{child.name}</span>
                  <span className="text-ds-caption text-muted-foreground">
                    {child.classroomName
                      ? `Rombel ${child.classroomName}`
                      : "Belum ada rombel pada semester aktif"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {role === "school_admin" ? (
        <div className="flex flex-col gap-2">
          <Link
            to="/impor"
            className="text-ds-body text-primary underline-offset-4 hover:underline"
          >
            Impor guru dan siswa dari Excel
          </Link>
          <Link
            to="/penugasan"
            className="text-ds-body text-primary underline-offset-4 hover:underline"
          >
            Penugasan guru dan wali kelas
          </Link>
          <Link
            to="/tahun-ajaran"
            className="text-ds-body text-primary underline-offset-4 hover:underline"
          >
            Tahun ajaran dan kenaikan kelas
          </Link>
          <Link
            to="/orang-tua"
            className="text-ds-body text-primary underline-offset-4 hover:underline"
          >
            Tautan orang tua dan kode undangan
          </Link>
        </div>
      ) : null}
    </main>
  )
}
