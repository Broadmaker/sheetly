import { type ReactNode, useEffect, useMemo, useState } from "react"
import {
  activityBucket,
  downloadCsv,
  fmt,
  fmtPeriod,
  type SchoolListItem,
  type SchoolsResponse,
} from "../lib/schools"
import { AlertIcon, CalendarIcon, ChartIcon, GridIcon, SearchIcon, SchoolIcon, UploadIcon, UsersIcon } from "./icons"

interface Props {
  onOpenSchool: (schoolId: string) => void
  onGoUpload: () => void
}

type SortKey = "id" | "name" | "registered" | "actual" | "participation" | "downloads" | "roster"
type SortDir = "asc" | "desc"

const ACTIVITY_OPTIONS = ["No Activity", "Low Activity", "Moderate Activity", "High Activity"] as const

function badge(text: string, className: string) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{text}</span>
}

export default function SchoolDirectory({ onOpenSchool, onGoUpload }: Props) {
  const [data, setData] = useState<SchoolsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<"all" | "master" | "extra">("all")
  const [utilization, setUtilization] = useState<"all" | "with" | "without">("all")
  const [roster, setRoster] = useState<"all" | "with" | "without">("all")
  const [activity, setActivity] = useState<"all" | (typeof ACTIVITY_OPTIONS)[number]>("all")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)
  const pageSize = 50

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/schools")
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? `Unable to load schools (${response.status})`)
        if (!cancelled) setData(payload as SchoolsResponse)
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load schools")
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const query = search.trim().toLowerCase()
    let rows = data.schools.filter((school) => {
      if (query) {
        const haystack = `${school.schoolId} ${school.schoolName} ${school.reportedName ?? ""}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (scope === "master" && !school.isMaster) return false
      if (scope === "extra" && school.isMaster) return false
      if (utilization === "with" && !school.hasUtilization) return false
      if (utilization === "without" && school.hasUtilization) return false
      if (roster === "with" && school.userUploadCount === 0) return false
      if (roster === "without" && school.userUploadCount > 0) return false
      if (activity !== "all" && activityBucket(school.downloads) !== activity) return false
      return true
    })

    const direction = sortDir === "asc" ? 1 : -1
    rows = [...rows].sort((a, b) => {
      if (sortKey === "id") {
        return a.schoolId.localeCompare(b.schoolId, undefined, { numeric: true }) * direction
      }
      if (sortKey === "name") {
        return a.schoolName.localeCompare(b.schoolName, undefined, { numeric: true, sensitivity: "base" }) * direction
      }
      if (sortKey === "roster") {
        return ((a.latestRosterCount ?? 0) - (b.latestRosterCount ?? 0)) * direction
      }
      const pick = (school: SchoolListItem): number | null => {
        if (sortKey === "registered") return school.registeredUsers
        if (sortKey === "actual") return school.actualUsers
        if (sortKey === "participation") return school.participationRate
        return school.downloads
      }
      return ((pick(a) ?? -1) - (pick(b) ?? -1)) * direction
    })
    return rows
  }, [data, search, scope, utilization, roster, activity, sortKey, sortDir])

  useEffect(() => setPage(1), [search, scope, utilization, roster, activity, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)
  const activeFilterCount = [
    search.trim(),
    scope !== "all",
    utilization !== "all",
    roster !== "all",
    activity !== "all",
  ].filter(Boolean).length

  function clearFilters() {
    setSearch("")
    setScope("all")
    setUtilization("all")
    setRoster("all")
    setActivity("all")
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "name" || key === "id" ? "asc" : "desc")
    }
  }

  function exportCsv() {
    downloadCsv(
      "school-directory.csv",
      ["School ID", "School Name", "Registered", "Registered Change", "Actual", "Actual Change", "Participation", "Participation Change (pp)", "Downloads", "Downloads Change", "User Uploads", "Latest Roster", "In Master List"],
      filtered.map((school) => [
        school.schoolId,
        school.schoolName,
        school.registeredUsers,
        school.registeredUsersChange,
        school.actualUsers,
        school.actualUsersChange,
        school.participationRate,
        school.participationRateChange,
        school.downloads,
        school.downloadsChange,
        school.userUploadCount,
        school.latestRosterPeriod,
        school.isMaster ? "Yes" : "No",
      ]),
    )
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[26px] border border-indigo-900 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white shadow-[0_24px_65px_-32px_rgba(30,27,75,0.8)]">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-44 left-1/3 size-80 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur"><SchoolIcon className="size-7" /></div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">Division school directory</div>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Schools</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-indigo-100">A complete directory from <b className="font-semibold text-white">ListofSchool.xlsx</b>, enriched with utilization and uploaded roster coverage. Select any school to inspect its users and period changes.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button onClick={exportCsv} disabled={!filtered.length} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/20 disabled:opacity-40">Export directory</button>
              <button onClick={onGoUpload} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-indigo-950 shadow-lg shadow-black/20 hover:bg-indigo-50"><UploadIcon className="size-4" /> Upload files</button>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur sm:grid-cols-3 sm:divide-x sm:divide-white/10">
            <BannerMetric label="Directory schools" value={fmt(data?.summary.totalSchools)} icon={<SchoolIcon className="size-4" />} />
            <BannerMetric label="Schools with roster" value={fmt(data?.summary.withRoster)} icon={<UsersIcon className="size-4" />} />
            <BannerMetric label="Latest utilization" value={fmtPeriod(data?.latestPeriod)} icon={<CalendarIcon className="size-4" />} />
          </div>
        </div>
      </section>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Master schools", value: data.summary.masterSchools, tone: "text-slate-950", accent: "bg-slate-800", icon: <GridIcon className="size-4" /> },
            { label: "Extra schools", value: data.summary.extraSchools, tone: "text-amber-700", accent: "bg-amber-500", icon: <SchoolIcon className="size-4" /> },
            { label: "With utilization", value: data.summary.withUtilization, tone: "text-emerald-700", accent: "bg-emerald-500", icon: <ChartIcon className="size-4" /> },
            { label: "No utilization", value: data.summary.withoutUtilization, tone: "text-slate-600", accent: "bg-slate-400", icon: <AlertIcon className="size-4" /> },
            { label: "With roster", value: data.summary.withRoster, tone: "text-indigo-700", accent: "bg-indigo-500", icon: <UsersIcon className="size-4" /> },
            { label: "No roster", value: data.summary.withoutRoster, tone: "text-rose-700", accent: "bg-rose-500", icon: <UsersIcon className="size-4" /> },
          ].map((item) => (
            <DirectoryMetric key={item.label} {...item} />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4" />{error}</div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : !data || !data.schools.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-indigo-50 text-indigo-600 grid place-items-center"><SchoolIcon className="size-6" /></div>
          <div className="mt-3 text-sm font-bold text-slate-900">No schools in the directory yet</div>
          <div className="text-xs text-slate-600 mt-1">The master list is seeded by the database migration. If this is empty, run the latest migration, then refresh.</div>
          <button onClick={onGoUpload} className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700">Go to uploads</button>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)]">
          <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="mr-3 shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quick views</div>
                <div className="text-[10px] text-slate-400">Combine coverage filters</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <QuickFilter label="All schools" count={data.summary.totalSchools} active={activeFilterCount === 0} onClick={clearFilters} />
                <QuickFilter label="Master list" count={data.summary.masterSchools} active={scope === "master"} tone="indigo" onClick={() => setScope((value) => value === "master" ? "all" : "master")} />
                <QuickFilter label="With roster" count={data.summary.withRoster} active={roster === "with"} tone="violet" onClick={() => setRoster((value) => value === "with" ? "all" : "with")} />
                <QuickFilter label="No roster" count={data.summary.withoutRoster} active={roster === "without"} tone="rose" onClick={() => setRoster((value) => value === "without" ? "all" : "without")} />
                <QuickFilter label="With utilization" count={data.summary.withUtilization} active={utilization === "with"} tone="emerald" onClick={() => setUtilization((value) => value === "with" ? "all" : "with")} />
                <QuickFilter label="No utilization" count={data.summary.withoutUtilization} active={utilization === "without"} tone="amber" onClick={() => setUtilization((value) => value === "without" ? "all" : "without")} />
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1 lg:max-w-md">
                <label className="sr-only" htmlFor="school-search">Search schools</label>
                <input id="school-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search school name or ID" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10" />
                <SearchIcon className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" />
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filters</span>
                <FilterSelect label="Directory list" value={scope} onChange={(value) => setScope(value as typeof scope)} options={[["all", "All schools"], ["master", "Master only"], ["extra", "Extra only"]]} />
                <FilterSelect label="Utilization" value={utilization} onChange={(value) => setUtilization(value as typeof utilization)} options={[["all", "All utilization"], ["with", "With data"], ["without", "No data"]]} />
                <FilterSelect label="Roster" value={roster} onChange={(value) => setRoster(value as typeof roster)} options={[["all", "All rosters"], ["with", "Has roster"], ["without", "No roster"]]} />
                <FilterSelect label="Activity" value={activity} onChange={(value) => setActivity(value as typeof activity)} options={[["all", "All activity"], ...ACTIVITY_OPTIONS.map((option) => [option, option] as [string, string])]} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span><b className="font-bold text-slate-800">{fmt(filtered.length)}</b> of {fmt(data.schools.length)} schools{data.latestPeriod ? ` • Utilization ${fmtPeriod(data.latestPeriod)}` : ""}{data.previousPeriod ? ` vs ${fmtPeriod(data.previousPeriod)}` : ""}</span>
              {activeFilterCount > 0 && <button onClick={clearFilters} className="rounded-lg px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-50">Clear {activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"}</button>}
            </div>
          </div>

          {data.latestPeriod && data.previousPeriod && (
            <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-5 py-2.5 text-[11px] text-indigo-800">
              <ChartIcon className="size-3.5 shrink-0" /><span>Change badges compare <b>{fmtPeriod(data.latestPeriod)}</b> with <b>{fmtPeriod(data.previousPeriod)}</b>. Participation changes are percentage points.</span>
            </div>
          )}

          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <caption className="sr-only">School directory with utilization and roster coverage</caption>
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                <tr>
                  <SortableTh label="School ID" active={sortKey === "id"} dir={sortDir} onClick={() => toggleSort("id")} />
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">School Name</th>
                  <SortableTh label="Registered" align="right" active={sortKey === "registered"} dir={sortDir} onClick={() => toggleSort("registered")} />
                  <SortableTh label="Actual" align="right" active={sortKey === "actual"} dir={sortDir} onClick={() => toggleSort("actual")} />
                  <SortableTh label="Participation" align="right" active={sortKey === "participation"} dir={sortDir} onClick={() => toggleSort("participation")} />
                  <SortableTh label="Downloads" align="right" active={sortKey === "downloads"} dir={sortDir} onClick={() => toggleSort("downloads")} />
                  <SortableTh label="Roster" align="right" active={sortKey === "roster"} dir={sortDir} onClick={() => toggleSort("roster")} />
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Latest Roster</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paged.map((school) => (
                  <tr key={school.schoolId} onClick={() => onOpenSchool(school.schoolId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpenSchool(school.schoolId) }} tabIndex={0} className="group cursor-pointer transition-colors hover:bg-indigo-50/50 focus-visible:bg-indigo-50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-semibold text-slate-500">{school.schoolId}</td>
                    <td className="max-w-[360px] px-3 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-semibold text-slate-900 group-hover:text-indigo-800" title={school.schoolName}>{school.schoolName}</span>
                        {!school.isMaster && badge("Extra", "bg-amber-50 text-amber-700 border-amber-200")}
                        {school.isMaster && !school.hasUtilization && badge("No utilization", "bg-slate-100 text-slate-500 border-slate-200")}
                      </div>
                      {school.nameMismatch && school.reportedName && (
                        <div className="mt-0.5 truncate text-[10px] text-amber-700" title={`Reported as ${school.reportedName} in user_count`}>Reported as: {school.reportedName}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700"><MetricWithChange value={fmt(school.registeredUsers)} change={school.registeredUsersChange} /></td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700"><MetricWithChange value={fmt(school.actualUsers)} change={school.actualUsersChange} /></td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700"><MetricWithChange value={school.participationRate == null ? "—" : `${school.participationRate}%`} change={school.participationRateChange} suffix=" pp" /></td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700"><MetricWithChange value={fmt(school.downloads)} change={school.downloadsChange} /></td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700">{school.userUploadCount ? fmt(school.latestRosterCount) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs">
                      {school.latestRosterPeriod ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700"><span className="size-1.5 rounded-full bg-indigo-500" />{fmtPeriod(school.latestRosterPeriod)}</span>
                      ) : (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">No roster</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!paged.length && (
                  <tr><td colSpan={8} className="px-3 py-16 text-center"><div className="mx-auto grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-400"><SearchIcon className="size-5" /></div><div className="mt-3 text-sm font-bold text-slate-800">No matching schools</div><div className="mt-1 text-xs text-slate-500">Try changing or clearing the active filters.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs sm:flex-row sm:px-5">
            <span className="text-slate-500">Showing <b className="font-semibold text-slate-700">{filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)}</b> of <b className="font-semibold text-slate-700">{fmt(filtered.length)}</b></span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900 disabled:opacity-40">← Previous</button>
              <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900 disabled:opacity-40">Next →</button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function MetricWithChange({ value, change, suffix = "" }: { value: string; change: number | null; suffix?: string }) {
  const formattedChange = change == null
    ? null
    : `${change > 0 ? "+" : ""}${Number.isInteger(change) ? fmt(change) : change.toFixed(1)}${suffix}`
  return (
    <div>
      <div>{value}</div>
      {formattedChange != null && <div className={`mt-0.5 text-[9px] font-bold ${change! > 0 ? "text-emerald-700" : change! < 0 ? "text-rose-700" : "text-slate-400"}`}>{formattedChange}</div>}
    </div>
  )
}

function BannerMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="border-b border-white/10 px-4 py-3 last:border-b-0 sm:border-b-0">
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-300">{icon}{label}</div>
      <div className="mt-1 text-lg font-black tracking-tight text-white">{value}</div>
    </div>
  )
}

function DirectoryMetric({ label, value, tone, accent, icon }: { label: string; value: number; tone: string; accent: string; icon: ReactNode }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <div className="flex items-center justify-between gap-2"><div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div><span className="text-slate-400">{icon}</span></div>
      <div className={`mt-2 text-2xl font-black tracking-tight ${tone}`}>{fmt(value)}</div>
    </div>
  )
}

function QuickFilter({ label, count, active, onClick, tone = "slate" }: { label: string; count: number; active: boolean; onClick: () => void; tone?: "slate" | "indigo" | "violet" | "rose" | "emerald" | "amber" }) {
  const activeClasses = {
    slate: "border-slate-800 bg-slate-900 text-white",
    indigo: "border-indigo-600 bg-indigo-600 text-white",
    violet: "border-violet-600 bg-violet-600 text-white",
    rose: "border-rose-600 bg-rose-600 text-white",
    emerald: "border-emerald-600 bg-emerald-600 text-white",
    amber: "border-amber-500 bg-amber-500 text-white",
  }[tone]
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm ${active ? activeClasses : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"}`}>
      {label}<span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{fmt(count)}</span>
    </button>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="sr-only">
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`not-sr-only rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500 ${value === "all" ? "border-slate-200 bg-white text-slate-600" : "border-indigo-200 bg-indigo-50 text-indigo-700"}`}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  )
}

function SortableTh({ label, align = "left", active, dir, onClick }: { label: string; align?: "left" | "right"; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-600 ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 rounded hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500">
        {label} <span aria-hidden="true" className={active ? "text-indigo-600" : "text-slate-300"}>{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  )
}
