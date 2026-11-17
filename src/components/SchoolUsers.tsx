import { type ReactNode, useEffect, useMemo, useState } from "react"
import {
  downloadCsv,
  emailTypeClasses,
  emailTypeLabel,
  fmt,
  fmtPeriod,
  formatCategory,
  formatDate,
  formatPersonName,
  type MemberEmailType,
  type SchoolDetailResponse,
  type SchoolUser,
} from "../lib/schools"
import { AlertIcon, CalendarIcon, CompareIcon, MailIcon, SchoolIcon, SearchIcon, TrendIcon, UploadIcon, UsersIcon } from "./icons"

interface Props {
  schoolId: string | null
  onChooseSchool: () => void
  onGoUpload: () => void
  onBack: () => void
}

type Tab = "current" | "changes" | "previous" | "removed"
type EmailFilter = "all" | MemberEmailType
type StatusFilter = "all" | "active" | "inactive"
type DownloadsFilter = "all" | "with" | "zero"
type ChangeFilter = "all" | "new" | "removed" | "downloads_up" | "downloads_down" | "downloads_same" | "profile_updated" | "status_changed"
type SortKey = "name" | "downloads" | "difference"

export default function SchoolUsers({ schoolId, onChooseSchool, onGoUpload, onBack }: Props) {
  const [data, setData] = useState<SchoolDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [roleFilter, setRoleFilter] = useState("all")
  const [genderFilter, setGenderFilter] = useState("all")
  const [downloadsFilter, setDownloadsFilter] = useState<DownloadsFilter>("all")
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all")
  const [tab, setTab] = useState<Tab>("current")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)
  const pageSize = 50

  useEffect(() => {
    if (!schoolId) {
      setData(null)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/schools/${encodeURIComponent(schoolId!)}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? `Unable to load school (${response.status})`)
        if (!cancelled) {
          setData(payload as SchoolDetailResponse)
          setTab("current")
          setSearch("")
          setEmailFilter("all")
          setStatusFilter("all")
          setRoleFilter("all")
          setGenderFilter("all")
          setDownloadsFilter("all")
          setChangeFilter("all")
          setPage(1)
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load school")
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [schoolId])

  const comparisonUsers = useMemo(() => data?.users ?? [], [data])
  const users = useMemo(
    () => (tab === "previous" ? data?.previousUsers ?? [] : comparisonUsers),
    [data, comparisonUsers, tab],
  )
  const tabUsers = useMemo(() => users.filter((user) => {
    if (tab === "current") return user.change !== "removed"
    if (tab === "removed") return user.change === "removed"
    if (tab === "changes") return hasTrackedChange(user)
    return true
  }), [users, tab])
  const roles = useMemo(() => categoryOptions(tabUsers.map((user) => user.role)), [tabUsers])
  const genders = useMemo(() => categoryOptions(tabUsers.map((user) => user.gender)), [tabUsers])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    let rows = tabUsers.filter((user) => {
      if (query) {
        const haystack = `${user.memberId} ${user.fullName ?? ""} ${user.email ?? ""} ${user.role ?? ""}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (emailFilter !== "all" && user.emailType !== emailFilter) return false
      if (statusFilter !== "all" && (user.status ?? "").toLowerCase() !== statusFilter) return false
      if (roleFilter !== "all" && categoryKey(user.role) !== roleFilter) return false
      if (genderFilter !== "all" && categoryKey(user.gender) !== genderFilter) return false
      if (downloadsFilter === "with" && (user.totalDownloads ?? 0) <= 0) return false
      if (downloadsFilter === "zero" && (user.totalDownloads ?? 0) > 0) return false
      if (tab !== "previous" && changeFilter !== "all" && !matchesChange(user, changeFilter)) return false
      return true
    })

    const direction = sortDir === "asc" ? 1 : -1
    rows = [...rows].sort((a, b) => {
      if (sortKey === "downloads") return ((a.totalDownloads ?? -1) - (b.totalDownloads ?? -1)) * direction
      if (sortKey === "difference") return ((a.difference ?? -1) - (b.difference ?? -1)) * direction
      return (a.fullName ?? a.memberId).localeCompare(b.fullName ?? b.memberId, undefined, { numeric: true, sensitivity: "base" }) * direction
    })
    return rows
  }, [tabUsers, tab, search, emailFilter, statusFilter, roleFilter, genderFilter, downloadsFilter, changeFilter, sortKey, sortDir])

  useEffect(() => setPage(1), [tab, search, emailFilter, statusFilter, roleFilter, genderFilter, downloadsFilter, changeFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }

  function exportCsv() {
    if (!data) return
    const isPrevious = tab === "previous"
    const baseHeaders = ["Member ID", "Name", "Gender", "Status", "Email", "Email Type", "Portal Role", "Downloads"]
    const comparisonHeaders = ["Previous Downloads", "Download Change"]
    downloadCsv(
      `school-${data.school.schoolId}-${tab}-users.csv`,
      [...baseHeaders, ...(isPrevious ? [] : comparisonHeaders), "Registered", ...(isPrevious ? [] : ["Change"])],
      filtered.map((user) => [
        user.memberId,
        formatPersonName(user.fullName),
        formatCategory(user.gender),
        user.status,
        user.email,
        emailTypeLabel(user.emailType),
        formatCategory(user.role),
        user.totalDownloads,
        ...(isPrevious ? [] : [user.previousDownloads, user.difference]),
        user.registeredAt,
        ...(isPrevious ? [] : [changeLabels(user).join("; ")]),
      ]),
    )
  }

  if (!schoolId) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-indigo-50 text-indigo-600 grid place-items-center"><SchoolIcon className="size-6" /></div>
        <div className="mt-3 text-lg font-extrabold text-slate-900">Choose a school first</div>
        <div className="text-sm text-slate-600 mt-1">Open the Schools list and select a school to view its uploaded users and changes.</div>
        <button onClick={onChooseSchool} className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700">Open Schools</button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
        <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-red-50 text-red-600 grid place-items-center"><AlertIcon className="size-6" /></div>
        <div className="mt-3 text-lg font-extrabold text-slate-900">Unable to load this school</div>
        <div className="text-sm text-slate-600 mt-1">{error ?? "The school could not be found."}</div>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={onBack} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-700">Back to Schools</button>
          <button onClick={onChooseSchool} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700">Choose another</button>
        </div>
      </div>
    )
  }

  const summary = data.summary
  const hasRoster = Boolean(data.current)
  const changedUserCount = comparisonUsers.filter(hasTrackedChange).length
  const tabDescription = {
    current: `Everyone in the latest roster${data.current ? ` for ${fmtPeriod(data.current.period)}` : ""}.`,
    changes: `New, updated, and removed users compared with ${fmtPeriod(data.previous?.period)}.`,
    previous: `The complete roster from ${fmtPeriod(data.previous?.period)}, before the latest upload.`,
    removed: "Users present in the previous roster but missing from the latest roster.",
  }[tab]
  const activeFilterCount = [
    search.trim(),
    emailFilter !== "all",
    statusFilter !== "all",
    roleFilter !== "all",
    genderFilter !== "all",
    downloadsFilter !== "all",
    tab !== "previous" && changeFilter !== "all",
  ].filter(Boolean).length
  const quickCounts = {
    all: tabUsers.length,
    deped: tabUsers.filter((user) => user.emailType === "deped").length,
    nonDeped: tabUsers.filter((user) => user.emailType === "non_deped").length,
    missingEmail: tabUsers.filter((user) => user.emailType === "invalid_missing").length,
    female: tabUsers.filter((user) => categoryKey(user.gender) === "female").length,
    male: tabUsers.filter((user) => categoryKey(user.gender) === "male").length,
  }

  function clearFilters() {
    setSearch("")
    setEmailFilter("all")
    setStatusFilter("all")
    setRoleFilter("all")
    setGenderFilter("all")
    setDownloadsFilter("all")
    setChangeFilter("all")
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[26px] border border-indigo-900 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white shadow-[0_24px_65px_-32px_rgba(30,27,75,0.8)]">
        <div className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 size-80 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative px-5 py-5 sm:px-7 sm:py-6">
          <button onClick={onBack} className="group mb-4 inline-flex items-center gap-2 rounded-lg text-xs font-semibold text-indigo-200 hover:text-white">
            <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">←</span> School directory
          </button>

          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur sm:size-14">
                <SchoolIcon className="size-7" />
              </div>
              <div className="min-w-0">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">School workspace</div>
                <h1 className="truncate text-2xl font-black tracking-tight text-white sm:text-[30px]" title={data.school.schoolName}>{data.school.schoolName}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-indigo-100">
                  <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono font-semibold">ID {data.school.schoolId}</span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">{data.school.divisionName ?? "Zamboanga Sibugay"}</span>
                  {data.school.isMaster ? <span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-1 font-semibold text-emerald-200">Master list verified</span> : <span className="rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-200">Outside master list</span>}
                  {data.school.nameMismatch && data.school.reportedName && <span className="rounded-full border border-amber-300/30 bg-amber-400/15 px-2.5 py-1 text-amber-100" title={`Reported as ${data.school.reportedName} in user_count`}>Name needs review</span>}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              {data.current && (
                <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 shadow-sm backdrop-blur">
                  <CalendarIcon className="size-4 text-indigo-200" />
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-300">Latest roster</div>
                    <div className="text-xs font-bold text-white">{fmtPeriod(data.current.period)}</div>
                  </div>
                  {data.previous && <div className="border-l border-white/15 pl-3 text-[10px] text-indigo-300">vs<br /><span className="font-semibold text-indigo-100">{fmtPeriod(data.previous.period)}</span></div>}
                </div>
              )}
              <button onClick={onGoUpload} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-indigo-950 shadow-lg shadow-black/20 hover:bg-indigo-50">
                <UploadIcon className="size-4" /> Upload roster
              </button>
            </div>
          </div>

          {data.utilization && <div className="mt-6 flex items-center gap-2 text-[10px] font-semibold text-indigo-200"><TrendIcon className="size-3.5" /> Utilization {fmtPeriod(data.utilization.period)}{data.utilization.previousPeriod ? ` vs ${fmtPeriod(data.utilization.previousPeriod)}` : " • baseline"}</div>}
          <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur sm:grid-cols-4 sm:divide-x sm:divide-white/10">
            <HeaderMetric label="Registered users" value={fmt(data.utilization?.registeredUsers)} change={data.utilization?.registeredUsersChange} />
            <HeaderMetric label="Actual users" value={fmt(data.utilization?.actualUsers)} change={data.utilization?.actualUsersChange} />
            <HeaderMetric label="Participation" value={data.utilization?.participationRate == null ? "—" : `${data.utilization.participationRate}%`} change={data.utilization?.participationRateChange} suffix=" pp" />
            <HeaderMetric label="Portal downloads" value={fmt(data.utilization?.downloads)} change={data.utilization?.downloadsChange} />
          </div>
        </div>
      </section>

      {!hasRoster ? (
        <div className="rounded-[24px] border border-dashed border-indigo-300 bg-gradient-to-br from-white to-indigo-50/70 p-10 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"><UploadIcon className="size-6" /></div>
          <div className="mt-4 text-lg font-extrabold text-slate-950">Build this school’s first roster</div>
          <div className="mx-auto mt-2 max-w-lg text-sm text-slate-600">Upload <b className="font-semibold text-slate-800">deped-school-id-{data.school.schoolId}-user-details</b>. The next upload will automatically unlock additions, removals, and download comparisons.</div>
          <button onClick={onGoUpload} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-slate-900/15 hover:bg-indigo-700">Upload first roster</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
            <Kpi label="Roster users" value={fmt(summary.currentMembers)} tone="text-slate-950" accent="bg-slate-800" icon={<UsersIcon className="size-4" />} />
            <Kpi label="DepEd emails" value={fmt(summary.deped)} tone="text-emerald-700" accent="bg-emerald-500" icon={<MailIcon className="size-4" />} />
            <Kpi label="Non-DepEd" value={fmt(summary.nonDeped)} tone="text-amber-700" accent="bg-amber-500" icon={<MailIcon className="size-4" />} />
            <Kpi label="Missing email" value={fmt(summary.invalidEmail)} tone="text-slate-600" accent="bg-slate-400" icon={<AlertIcon className="size-4" />} />
            <Kpi label="New users" value={fmt(summary.newMembers)} tone="text-indigo-700" accent="bg-indigo-500" icon={<TrendIcon className="size-4" />} />
            <Kpi label="Removed" value={fmt(summary.removedMembers)} tone="text-rose-700" accent="bg-rose-500" icon={<UsersIcon className="size-4" />} />
            <Kpi label="Downloads" value={fmt(summary.totalDownloads)} sub={data.hasPrevious ? `${summary.downloadsDifference >= 0 ? "+" : ""}${fmt(summary.downloadsDifference)} vs ${fmtPeriod(data.previous?.period)}` : "Baseline period"} tone="text-slate-950" accent="bg-violet-500" icon={<TrendIcon className="size-4" />} />
          </div>

          {!data.hasPrevious && (
            <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-900"><CompareIcon className="mt-0.5 size-4 shrink-0" /><div><span className="font-bold">Baseline roster saved.</span> Upload the next period for this school to unlock comparison views and change tracking.</div></div>
          )}

          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)]">
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
                {([
                  ["current", `Latest roster (${summary.currentMembers})`],
                  ["changes", `All changes (${changedUserCount})`],
                  ["previous", `Previous roster (${summary.previousMembers})`],
                  ["removed", `Removed only (${summary.removedMembers})`],
                ] as Array<[Tab, string]>).map(([value, label]) => (
                  <button key={value} onClick={() => setTab(value)} disabled={(value === "previous" || value === "changes" || value === "removed") && !data.hasPrevious} aria-pressed={tab === value} className={`rounded-xl px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${tab === value ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/70 hover:text-slate-800"}`}>{label}</button>
                ))}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                  <CompareIcon className="size-4 text-slate-400" />
                  {data.previous ? `${fmtPeriod(data.previous.period)} → ${fmtPeriod(data.current?.period)}` : "Waiting for the next reporting period"}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-600">{tabDescription}</p>
            </div>

            <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="mr-2 shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quick views</div>
                  <div className="text-[10px] text-slate-400">Select email and gender together</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <QuickFilter label="All users" count={quickCounts.all} active={activeFilterCount === 0} onClick={clearFilters} />
                  <QuickFilter label="DepEd email" count={quickCounts.deped} active={emailFilter === "deped"} tone="emerald" onClick={() => setEmailFilter((value) => value === "deped" ? "all" : "deped")} />
                  <QuickFilter label="Non-DepEd" count={quickCounts.nonDeped} active={emailFilter === "non_deped"} tone="amber" onClick={() => setEmailFilter((value) => value === "non_deped" ? "all" : "non_deped")} />
                  <QuickFilter label="No / invalid email" count={quickCounts.missingEmail} active={emailFilter === "invalid_missing"} tone="rose" onClick={() => setEmailFilter((value) => value === "invalid_missing" ? "all" : "invalid_missing")} />
                  <span className="mx-1 hidden w-px self-stretch bg-slate-200 sm:block" aria-hidden="true" />
                  <QuickFilter label="Female" count={quickCounts.female} active={genderFilter === "female"} tone="violet" onClick={() => setGenderFilter((value) => value === "female" ? "all" : "female")} />
                  <QuickFilter label="Male" count={quickCounts.male} active={genderFilter === "male"} tone="sky" onClick={() => setGenderFilter((value) => value === "male" ? "all" : "male")} />
                </div>
              </div>
            </div>

            <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1 lg:max-w-sm">
                <label className="sr-only" htmlFor="user-search">Search users</label>
                <input id="user-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, member ID, or email" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10" />
                <SearchIcon className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" />
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filters</span>
                  <FilterSelect label="Email" value={emailFilter} onChange={(value) => setEmailFilter(value as EmailFilter)} options={[["all", "All emails"], ["deped", "DepEd"], ["non_deped", "Non-DepEd"], ["invalid_missing", "Missing/Invalid"]]} />
                  <FilterSelect label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} options={[["all", "All status"], ["active", "Active"], ["inactive", "Inactive"]]} />
                  <FilterSelect label="Role" value={roleFilter} onChange={setRoleFilter} options={[["all", "All roles"], ...roles]} />
                  <FilterSelect label="Gender" value={genderFilter} onChange={setGenderFilter} options={[["all", "All genders"], ...genders]} />
                  <FilterSelect label="Downloads" value={downloadsFilter} onChange={(value) => setDownloadsFilter(value as DownloadsFilter)} options={[["all", "All downloads"], ["with", "With downloads"], ["zero", "Zero downloads"]]} />
                  {tab !== "previous" && <FilterSelect label="Change" value={changeFilter} onChange={(value) => setChangeFilter(value as ChangeFilter)} options={[["all", "Any change"], ["new", "New user"], ["downloads_up", "Downloads up"], ["downloads_down", "Downloads down"], ["downloads_same", "Downloads same"], ["profile_updated", "Profile changed"], ["status_changed", "Status changed"], ["removed", "Removed"]]} />}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span><b className="font-bold text-slate-800">{fmt(filtered.length)}</b> users shown</span>
                  {activeFilterCount > 0 && <button onClick={clearFilters} className="rounded-lg px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-50">Clear {activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"}</button>}
                </div>
                <button onClick={exportCsv} disabled={!filtered.length} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40">Export CSV</button>
              </div>
            </div>

            {data.hasPrevious && tab !== "previous" && (
              <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-5 py-2.5 text-[11px] text-indigo-800">
                <CompareIcon className="size-3.5 shrink-0" /><span><b className="font-bold">Download change</b> is the current total minus the total recorded in the previous roster.</span>
              </div>
            )}

            <div className="max-h-[640px] overflow-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <caption className="sr-only">{tabDescription}</caption>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Member ID</th>
                    <SortableTh label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Gender</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Email</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Email Type</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Role</th>
                    <SortableTh label="Downloads" align="right" active={sortKey === "downloads"} dir={sortDir} onClick={() => toggleSort("downloads")} />
                    {tab !== "previous" && <SortableTh label="Download change" hint="Current downloads minus downloads in the previous roster" align="right" active={sortKey === "difference"} dir={sortDir} onClick={() => toggleSort("difference")} />}
                    <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Registered</th>
                    {tab !== "previous" && <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-slate-600">Change</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paged.map((user) => (
                    <tr key={user.memberId} className={`group transition-colors hover:bg-indigo-50/40 ${user.flags.new ? "bg-indigo-50/25" : user.flags.removed ? "bg-rose-50/35" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-semibold text-slate-500">{user.memberId}</td>
                      <td className="max-w-[240px] truncate px-3 py-3 font-semibold text-slate-900" title={formatPersonName(user.fullName)}>{formatPersonName(user.fullName)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{formatCategory(user.gender)}</td>
                      <td className="whitespace-nowrap px-3 py-3"><StatusBadge status={user.status} /></td>
                      <td className="max-w-[260px] truncate px-3 py-3 text-xs text-slate-600" title={user.email ?? undefined}>{user.email ?? <span className="text-slate-400">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${emailTypeClasses(user.emailType)}`}>{emailTypeLabel(user.emailType)}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{formatCategory(user.role)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700">{fmt(user.totalDownloads)}</td>
                      {tab !== "previous" && <td className="px-3 py-3 text-right font-mono text-xs font-bold"><Delta value={user.difference} /></td>}
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{formatDate(user.registeredAt)}</td>
                      {tab !== "previous" && <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{changeBadges(user)}</div></td>}
                    </tr>
                  ))}
                  {!paged.length && (
                    <tr><td colSpan={tab === "previous" ? 9 : 11} className="px-3 py-16 text-center"><div className="mx-auto grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-400"><SearchIcon className="size-5" /></div><div className="mt-3 text-sm font-bold text-slate-800">No matching users</div><div className="mt-1 text-xs text-slate-500">Try changing or clearing the active filters.</div></td></tr>
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
        </>
      )}
    </div>
  )
}

function hasTrackedChange(user: SchoolUser): boolean {
  const flags = user.flags
  return flags.new || flags.removed || flags.downloadsUp || flags.downloadsDown || flags.profileUpdated || flags.statusChanged
}

function matchesChange(user: SchoolUser, filter: ChangeFilter): boolean {
  if (filter === "all") return true
  if (filter === "new") return user.flags.new
  if (filter === "removed") return user.flags.removed
  if (filter === "downloads_up") return user.flags.downloadsUp
  if (filter === "downloads_down") return user.flags.downloadsDown
  if (filter === "downloads_same") return user.flags.downloadsSame && !user.flags.new
  if (filter === "profile_updated") return user.flags.profileUpdated
  if (filter === "status_changed") return user.flags.statusChanged
  return true
}

function categoryKey(value: string | null): string {
  return (value ?? "").trim().toLocaleLowerCase("en-US")
}

function categoryOptions(values: Array<string | null>): Array<[string, string]> {
  const options = new Map<string, string>()
  for (const value of values) {
    const key = categoryKey(value)
    if (key && !options.has(key)) options.set(key, formatCategory(value))
  }
  return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }))
}

function changeLabels(user: SchoolUser): string[] {
  const labels: string[] = []
  if (user.flags.new) labels.push("New")
  if (user.flags.removed) labels.push("Removed")
  if (user.flags.downloadsUp) labels.push("Downloads up")
  if (user.flags.downloadsDown) labels.push("Downloads down")
  if (user.flags.downloadsSame) labels.push("Downloads same")
  if (user.flags.profileUpdated) labels.push("Profile changed")
  if (user.flags.statusChanged) labels.push("Status changed")
  return labels
}

function changeBadges(user: SchoolUser) {
  const badges: Array<{ label: string; className: string; title?: string }> = []
  if (user.flags.new) badges.push({ label: "New", className: "bg-indigo-50 text-indigo-700 border-indigo-200" })
  if (user.flags.removed) badges.push({ label: "Removed", className: "bg-red-50 text-red-700 border-red-200" })
  if (user.flags.downloadsUp) badges.push({ label: `+${fmt(user.difference)}`, className: "bg-emerald-50 text-emerald-700 border-emerald-200" })
  if (user.flags.downloadsDown) badges.push({ label: fmt(user.difference), className: "bg-red-50 text-red-700 border-red-200" })
  if (user.flags.profileUpdated) badges.push({ label: "Profile", className: "bg-amber-50 text-amber-700 border-amber-200", title: user.changedFields.map((field) => `${field.label}: ${field.previous ?? "—"} → ${field.current ?? "—"}`).join("\n") })
  if (user.flags.statusChanged) badges.push({ label: "Status", className: "bg-amber-50 text-amber-700 border-amber-200" })
  if (!badges.length) badges.push({ label: user.change === "removed" ? "Removed" : "No change", className: "bg-slate-100 text-slate-500 border-slate-200" })
  return badges.map((badge, index) => (
    <span key={`${badge.label}-${index}`} title={badge.title} className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
  ))
}

function StatusBadge({ status }: { status: string | null }) {
  const value = (status ?? "").toLowerCase()
  if (value === "active") return <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">ACTIVE</span>
  if (value === "inactive") return <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">INACTIVE</span>
  return <span className="text-xs text-slate-400">{status ?? "—"}</span>
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>
  if (value > 0) return <span className="text-emerald-700">+{fmt(value)}</span>
  if (value < 0) return <span className="text-red-700">{fmt(value)}</span>
  return <span className="text-slate-500">0</span>
}

function HeaderMetric({ label, value, change, suffix = "" }: { label: string; value: string; change?: number | null; suffix?: string }) {
  const formattedChange = change == null
    ? null
    : `${change > 0 ? "+" : ""}${Number.isInteger(change) ? fmt(change) : change.toFixed(1)}${suffix}`
  return (
    <div className="border-b border-white/10 px-4 py-3 last:border-b-0 sm:border-b-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-indigo-300">{label}</div>
      <div className="mt-0.5 text-lg font-black tracking-tight text-white">{value}</div>
      {formattedChange != null && <div className={`text-[9px] font-bold ${change! > 0 ? "text-emerald-300" : change! < 0 ? "text-rose-300" : "text-indigo-300"}`}>{formattedChange} vs previous</div>}
    </div>
  )
}

function Kpi({ label, value, sub, tone, accent, icon }: { label: string; value: string; sub?: string; tone: string; accent: string; icon: ReactNode }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className={`mt-2 truncate text-2xl font-black tracking-tight ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{sub}</div>}
    </div>
  )
}

function QuickFilter({ label, count, active, onClick, tone = "slate" }: { label: string; count: number; active: boolean; onClick: () => void; tone?: "slate" | "emerald" | "amber" | "rose" | "violet" | "sky" }) {
  const activeClasses = {
    slate: "border-slate-800 bg-slate-900 text-white",
    emerald: "border-emerald-600 bg-emerald-600 text-white",
    amber: "border-amber-500 bg-amber-500 text-white",
    rose: "border-rose-600 bg-rose-600 text-white",
    violet: "border-violet-600 bg-violet-600 text-white",
    sky: "border-sky-600 bg-sky-600 text-white",
  }[tone]

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm ${active ? activeClasses : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"}`}>
      {label}
      <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{fmt(count)}</span>
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

function SortableTh({ label, hint, align = "left", active, dir, onClick }: { label: string; hint?: string; align?: "left" | "right"; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th scope="col" title={hint} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-600 ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 rounded hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500">
        {label} <span aria-hidden="true" className={active ? "text-indigo-600" : "text-slate-300"}>{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  )
}
