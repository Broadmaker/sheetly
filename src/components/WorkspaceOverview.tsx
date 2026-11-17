import { type ReactNode, useCallback, useEffect, useState } from "react"
import { fmt, fmtPeriod, formatDate, type SchoolListItem, type SchoolsResponse } from "../lib/schools"
import type { AppView } from "../lib/navigation"
import { AlertIcon, CalendarIcon, ChartIcon, GridIcon, SchoolIcon, TrendIcon, UploadIcon, UsersIcon } from "./icons"

interface RecentUpload {
  id: string
  module: string
  originalFilename: string
  reportingPeriod: string
  uploadedAt: string
  schoolId: string | null
  schoolName: string | null
  snapshot: { id: string; recordCount: number } | null
}

interface Props {
  user: string
  onNavigate: (view: AppView) => void
  onOpenSchool: (schoolId: string) => void
}

export default function WorkspaceOverview({ user, onNavigate, onOpenSchool }: Props) {
  const [schools, setSchools] = useState<SchoolsResponse | null>(null)
  const [uploads, setUploads] = useState<RecentUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [schoolsResponse, uploadsResponse] = await Promise.all([
        fetch("/api/schools"),
        fetch("/api/uploads?limit=50"),
      ])
      const schoolsPayload = await schoolsResponse.json().catch(() => ({}))
      const uploadsPayload = await uploadsResponse.json().catch(() => ({}))
      if (!schoolsResponse.ok) throw new Error(schoolsPayload.error ?? `Unable to load schools (${schoolsResponse.status})`)
      setSchools(schoolsPayload as SchoolsResponse)
      setUploads(Array.isArray(uploadsPayload.uploads) ? uploadsPayload.uploads : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the overview")
      setSchools(null)
      setUploads([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const rosterSchools = (schools?.schools ?? []).filter((school: SchoolListItem) => school.userUploadCount > 0)
  const totalUsers = rosterSchools.reduce((total, school) => total + (school.latestRosterCount ?? 0), 0)
  const latestRoster = rosterSchools
    .map((school) => school.latestRosterPeriod)
    .filter((period): period is string => Boolean(period))
    .sort()
    .pop() ?? null
  const recent = uploads.filter((upload) => upload.module === "member").slice(0, 6)

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[26px] border border-indigo-900 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white shadow-[0_24px_65px_-32px_rgba(30,27,75,0.8)]">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-44 left-1/3 size-80 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur"><GridIcon className="size-7" /></div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">Division workspace</div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Welcome back, {user}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-indigo-100">Monitor school coverage, utilization, roster freshness, and recent imports from one operational workspace.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/20 disabled:opacity-40">{loading ? "Refreshing…" : "Refresh data"}</button>
              <button onClick={() => onNavigate("uploads")} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-indigo-950 shadow-lg shadow-black/20 hover:bg-indigo-50"><UploadIcon className="size-4" /> Upload data</button>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur sm:grid-cols-4 sm:divide-x sm:divide-white/10">
            <OverviewBannerMetric label="Master schools" value={fmt(schools?.summary.masterSchools)} icon={<SchoolIcon className="size-4" />} />
            <OverviewBannerMetric label="Roster coverage" value={`${fmt(schools?.summary.withRoster)} schools`} icon={<UsersIcon className="size-4" />} />
            <OverviewBannerMetric label="Latest roster" value={fmtPeriod(latestRoster)} icon={<CalendarIcon className="size-4" />} />
            <OverviewBannerMetric label="Latest users" value={fmt(totalUsers)} icon={<UsersIcon className="size-4" />} />
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4" />{error}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Master schools" value={fmt(schools?.summary.masterSchools)} sub={schools?.latestPeriod ? `Utilization ${fmtPeriod(schools.latestPeriod)}` : "No utilization upload"} tone="text-slate-950" accent="bg-slate-800" icon={<SchoolIcon className="size-4" />} />
        <Stat label="With utilization" value={fmt(schools?.summary.withUtilization)} sub="Matched in latest report" tone="text-emerald-700" accent="bg-emerald-500" icon={<ChartIcon className="size-4" />} />
        <Stat label="Extra schools" value={fmt(schools?.summary.extraSchools)} sub="Outside the master list" tone="text-amber-700" accent="bg-amber-500" icon={<AlertIcon className="size-4" />} />
        <Stat label="With roster" value={fmt(schools?.summary.withRoster)} sub={latestRoster ? `Latest ${fmtPeriod(latestRoster)}` : "No roster uploads"} tone="text-indigo-700" accent="bg-indigo-500" icon={<UsersIcon className="size-4" />} />
        <Stat label="Latest roster users" value={fmt(totalUsers)} sub={`${fmt(rosterSchools.length)} covered school${rosterSchools.length === 1 ? "" : "s"}`} tone="text-violet-700" accent="bg-violet-500" icon={<TrendIcon className="size-4" />} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => onNavigate("directory")} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)] hover:border-indigo-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white"><SchoolIcon className="size-5" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-950">Explore school directory</span>
            <span className="block truncate text-xs text-slate-500">Browse master schools, coverage, and latest rosters</span>
          </span>
          <span className="ml-auto text-slate-300 transition group-hover:translate-x-1 group-hover:text-indigo-600">→</span>
        </button>
        <button onClick={() => onNavigate("uploads")} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)] hover:border-emerald-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-600 group-hover:text-white"><UploadIcon className="size-5" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-950">Create reporting snapshot</span>
            <span className="block truncate text-xs text-slate-500">Validate a utilization file or school roster</span>
          </span>
          <span className="ml-auto text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-600">→</span>
        </button>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div>
            <div className="text-sm font-bold text-slate-950">Recent roster snapshots</div>
            <div className="text-xs text-slate-500">Newest per-school roster files only</div>
          </div>
          <button onClick={() => onNavigate("uploads")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700">Manage uploads</button>
        </div>
        {recent.length ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Recent school roster snapshots</caption>
              <thead className="border-b border-slate-200 bg-slate-50/90">
                <tr>
                  {(["Period", "School", "File"] as const).map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{label}</th>)}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Records</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((upload) => (
                  <tr key={upload.id} className="transition-colors hover:bg-indigo-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{fmtPeriod(upload.reportingPeriod)}</td>
                    <td className="px-4 py-3 text-xs">
                      {upload.schoolId ? (
                        <button onClick={() => onOpenSchool(upload.schoolId!)} className="font-semibold text-indigo-700 hover:underline text-left">{upload.schoolName ?? `School ${upload.schoolId}`}</button>
                      ) : (
                        <span className="text-slate-500">Division-wide</span>
                      )}
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-xs text-slate-600" title={upload.originalFilename}>{upload.originalFilename}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-700">{fmt(upload.snapshot?.recordCount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(upload.uploadedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500"><UsersIcon className="size-5" /></div>
            <div className="mt-3 text-sm font-bold text-slate-800">No roster snapshots yet</div>
            <div className="mt-1 text-xs text-slate-500">Upload a deped-school-id roster file to begin school-level tracking.</div>
            <button onClick={() => onNavigate("uploads")} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">Upload data</button>
          </div>
        )}
      </section>
    </div>
  )
}

function OverviewBannerMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="border-b border-white/10 px-4 py-3 last:border-b-0 sm:border-b-0"><div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-300">{icon}{label}</div><div className="mt-1 text-lg font-black tracking-tight text-white">{value}</div></div>
}

function Stat({ label, value, sub, tone, accent, icon }: { label: string; value: string; sub: string; tone: string; accent: string; icon: ReactNode }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <div className="flex items-center justify-between gap-2"><div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div><span className="text-slate-400">{icon}</span></div>
      <div className={`mt-2 text-2xl font-black tracking-tight ${tone}`}>{value}</div>
      <div className="truncate text-[10px] font-medium text-slate-500">{sub}</div>
    </div>
  )
}
