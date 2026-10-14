// Wizard setup pertama sekolah (OB-01). Hanya admin sekolah; setelah selesai
// halaman ini mengarahkan ke /beranda.

import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  getActiveSemesterFn,
  listClassroomsFn,
  listMajorsFn,
  listSubjectsFn,
  listYearsFn,
} from "@/features/academic/server/academic"
import { getAccess } from "@/features/auth/server/access"
import { SetupWizard } from "@/features/school-setup/components/wizard"
import { getSetupStateFn } from "@/features/school-setup/server/setup"

export const Route = createFileRoute("/(school)/setup")({
  beforeLoad: async () => {
    const { area, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => {
    const state = await getSetupStateFn()
    if (state.completed) throw redirect({ to: "/beranda" })

    const [years, majors, subjects, active] = await Promise.all([
      listYearsFn(),
      listMajorsFn(),
      listSubjectsFn(),
      getActiveSemesterFn(),
    ])
    const classrooms = active
      ? await listClassroomsFn({ data: { semesterId: active.id } })
      : []

    return { state, years, majors, subjects, classrooms, activeSemesterId: active?.id ?? null }
  },
  head: () => ({ meta: [{ title: "Setup sekolah — EduSaaS" }] }),
  component: SetupPage,
})

function SetupPage() {
  return <SetupWizard data={Route.useLoaderData()} />
}
