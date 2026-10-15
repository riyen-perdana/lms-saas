import { describe, expect, it } from "vitest"

import { ROLE_LABELS, breadcrumbFor, navForRole } from "./school-nav"

const labels = (role: string) =>
  navForRole(role).map((g) => [g.label, g.items.map((i) => i.label)])

describe("navForRole", () => {
  it("admin sekolah melihat semua grup", () => {
    expect(labels("school_admin")).toEqual([
      ["Utama", ["Beranda"]],
      ["Akademik", ["Tahun Ajaran", "Penugasan"]],
      ["Data", ["Pengguna", "Impor Data", "Orang Tua"]],
      ["Sistem", ["Audit"]],
    ])
  })

  it.each(["teacher", "student", "parent", "peran-tak-dikenal"])(
    "%s hanya melihat Beranda",
    (role) => {
      expect(labels(role)).toEqual([["Utama", ["Beranda"]]])
    }
  )

  it("setiap item menunjuk path unik", () => {
    const paths = navForRole("school_admin").flatMap((g) =>
      g.items.map((i) => i.to)
    )
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe("breadcrumbFor", () => {
  it("Beranda hanya satu segmen", () => {
    expect(breadcrumbFor("/beranda")).toEqual(["Beranda"])
  })

  it("halaman lain: grup lalu judul", () => {
    expect(breadcrumbFor("/audit")).toEqual(["Sistem", "Audit"])
    expect(breadcrumbFor("/orang-tua")).toEqual(["Data", "Orang Tua"])
    expect(breadcrumbFor("/tahun-ajaran")).toEqual(["Akademik", "Tahun Ajaran"])
  })

  it("path anak dan garis miring akhir tetap dikenali", () => {
    expect(breadcrumbFor("/impor/")).toEqual(["Data", "Impor Data"])
    expect(breadcrumbFor("/penugasan/abc")).toEqual(["Akademik", "Penugasan"])
  })

  it("path tak dikenal -> kosong", () => {
    expect(breadcrumbFor("/lain")).toEqual([])
    expect(breadcrumbFor("/auditx")).toEqual([])
  })
})

describe("ROLE_LABELS", () => {
  it("memetakan peran sekolah ke label Indonesia", () => {
    expect(ROLE_LABELS.school_admin).toBe("Admin sekolah")
    expect(ROLE_LABELS.parent).toBe("Orang tua")
  })
})
