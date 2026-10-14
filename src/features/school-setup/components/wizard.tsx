import { useState } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { completeSetupFn, type SetupResult } from "@/features/school-setup/server/setup"
import type { SetupState } from "@/features/school-setup/service"
import { cn } from "@/lib/utils"

import { ClassroomStep, MajorStep, SubjectStep } from "./master-steps"
import type { ClassroomRow, MajorRow, SubjectRow } from "./master-steps"
import { ProfileStep } from "./profile-step"
import { YearStep, type YearRow } from "./year-step"

export interface WizardData {
  state: SetupState
  years: YearRow[]
  majors: MajorRow[]
  classrooms: ClassroomRow[]
  subjects: SubjectRow[]
  activeSemesterId: string | null
}

type StepKey = "profil" | "tahun" | "jurusan" | "rombel" | "mapel"

const STEP_TITLES: Record<StepKey, { title: string; description: string }> = {
  profil: { title: "Profil sekolah", description: "Nama, NPSN, dan logo sekolah." },
  tahun: { title: "Tahun ajaran", description: "Tahun ajaran dan dua semester yang sedang berjalan." },
  jurusan: { title: "Jurusan", description: "Kompetensi keahlian di sekolah Anda." },
  rombel: { title: "Rombel", description: "Rombongan belajar pada semester aktif. Boleh dilewati dan diisi nanti." },
  mapel: { title: "Mata pelajaran", description: "Daftar mapel sekolah. Boleh dilewati dan diisi nanti." },
}

function firstIncomplete(steps: StepKey[], data: WizardData): number {
  const { state } = data
  const done: Record<StepKey, boolean> = {
    profil: state.yearCount > 0,
    tahun: state.yearCount > 0,
    jurusan: state.majorCount > 0,
    rombel: state.classroomCount > 0,
    mapel: state.subjectCount > 0,
  }
  const index = steps.findIndex((key) => !done[key])
  return index === -1 ? steps.length - 1 : index
}

export function SetupWizard({ data }: { data: WizardData }) {
  const router = useRouter()
  const navigate = useNavigate()
  const { state } = data
  const steps: StepKey[] = state.usesMajors
    ? ["profil", "tahun", "jurusan", "rombel", "mapel"]
    : ["profil", "tahun", "rombel", "mapel"]

  const [index, setIndex] = useState(() => firstIncomplete(steps, data))
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  const key = steps[index]
  const isLast = index === steps.length - 1
  const refresh = () => router.invalidate()

  async function finish() {
    setFinishError(null)
    setFinishing(true)
    try {
      const result: SetupResult = await completeSetupFn()
      if (!result.ok) {
        setFinishError(result.message)
        return
      }
      await navigate({ to: "/beranda" })
    } catch {
      setFinishError("Gagal menyelesaikan setup. Coba lagi.")
    } finally {
      setFinishing(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <PageHeader title={`Setup ${state.name}`} description="Lengkapi data dasar sekolah sebelum mulai memakai EduSaaS." />

      <ol className="flex flex-wrap gap-2" aria-label="Langkah setup">
        {steps.map((step, i) => (
          <li key={step}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "rounded-md border px-3 py-1 text-ds-meta",
                i === index ? "border-foreground font-medium" : "border-border text-muted-foreground"
              )}
            >
              {i + 1}. {STEP_TITLES[step].title}
            </button>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-4 rounded-lg border border-border p-5">
        <div>
          <h2 className="text-ds-body font-medium">{STEP_TITLES[key].title}</h2>
          <p className="text-ds-meta text-muted-foreground">{STEP_TITLES[key].description}</p>
        </div>

        {key === "profil" ? (
          <ProfileStep
            state={state}
            onSaved={async () => {
              await refresh()
              setIndex(1)
            }}
          />
        ) : null}
        {key === "tahun" ? <YearStep years={data.years} onChanged={refresh} /> : null}
        {key === "jurusan" ? <MajorStep majors={data.majors} onChanged={refresh} /> : null}
        {key === "rombel" ? (
          <ClassroomStep
            level={state.level}
            semesterId={data.activeSemesterId}
            majors={data.majors}
            classrooms={data.classrooms}
            onChanged={refresh}
          />
        ) : null}
        {key === "mapel" ? <SubjectStep subjects={data.subjects} onChanged={refresh} /> : null}
      </section>

      {finishError ? (
        <p role="alert" className="text-xs text-destructive">
          {finishError}
        </p>
      ) : null}

      <div className="flex justify-between">
        <Button type="button" variant="outline" className="rounded-md" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Kembali
        </Button>
        {key === "profil" ? null : isLast ? (
          <Button type="button" className="rounded-md" disabled={finishing || state.yearCount === 0} onClick={finish}>
            {finishing ? "Menyelesaikan..." : "Selesai"}
          </Button>
        ) : (
          <Button
            type="button"
            className="rounded-md"
            disabled={key === "tahun" && state.yearCount === 0}
            onClick={() => setIndex(index + 1)}
          >
            Lanjut
          </Button>
        )}
      </div>
    </main>
  )
}
