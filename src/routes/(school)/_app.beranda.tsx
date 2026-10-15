// Beranda sekolah (sementara). Dashboard sekolah penuh dikerjakan di F2+;
// halaman ini menjadi tujuan setelah login supaya alur masuk tidak buntu.

import { Link, createFileRoute } from "@tanstack/react-router"

import { ROLE_LABELS } from "@/components/dashboard/school-nav"
import { PageHeader } from "@/components/dashboard/page-header"
import { listMyChildrenFn } from "@/features/parent-link/server/parent-link"

export const Route = createFileRoute("/(school)/_app/beranda")({
  loader: async ({ context }) => ({
    children: context.role === "parent" ? await listMyChildrenFn() : [],
  }),
  head: () => ({ meta: [{ title: "Beranda — EduSaaS" }] }),
  component: SchoolHome,
})

function SchoolHome() {
  const { schoolName, user, role } = Route.useRouteContext()
  const { children } = Route.useLoaderData()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={schoolName}
        description={`Masuk sebagai ${user.name} · ${ROLE_LABELS[role] ?? role}`}
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
          <Link
            to="/audit"
            className="text-ds-body text-primary underline-offset-4 hover:underline"
          >
            Log audit
          </Link>
        </div>
      ) : null}
    </div>
  )
}
