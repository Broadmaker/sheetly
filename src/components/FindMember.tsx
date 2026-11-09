import { useDeferredValue, useEffect, useState } from "react"
import { AlertIcon, SearchIcon } from "./icons"

interface SearchResult {
  memberId: string
  fullName: string | null
  email: string | null
  accountStatus: string | null
  portalRole: string | null
  totalDownloads: number | null
  registeredAt: string | null
  reportingPeriod: string
  exportDate: string | null
  snapshotId: string
  schoolName: string | null
  districtName: string | null
}

interface ChangedField {
  field: string
  label: string
  previous: string | null
  current: string | null
}

interface HistoryEntry {
  snapshotId: string
  reportingPeriod: string
  exportDate: string | null
  downloadBasis: string
  originalFilename: string
  savedAt: string
  totalDownloads: number | null
  previousTotalDownloads: number | null
  difference: number | null
  percentageChange: number | null
  accountStatus: string | null
  portalRole: string | null
  email: string | null
  schoolId: string | null
  schoolName: string | null
  districtId: string | null
  districtName: string | null
  changedFields: ChangedField[]
}

interface DuplicateCase {
  id: string
  otherMemberId: string
  reason: string
  confidence: string
  status: string
  note: string | null
  createdAt: string
}

interface MemberDetail {
  memberId: string
  fullName: string | null
  lastName: string | null
  firstName: string | null
  middleName: string | null
  gender: string | null
  email: string | null
  accountStatus: string | null
  portalRole: string | null
  registeredAt: string | null
  latest: {
    snapshotId: string
    reportingPeriod: string
    exportDate: string | null
    originalFilename: string
    totalDownloads: number | null
    schoolId: string | null
    schoolName: string | null
    districtId: string | null
    districtName: string | null
  }
  snapshotsSeen: number
  history: HistoryEntry[]
  duplicateCases: DuplicateCase[]
  limitations: string[]
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function fmtPeriod(period: string): string {
  const [year, month] = period.split("-")
  const index = Number(month) - 1
  return index >= 0 && index < 12 ? `${MONTHS[index]} ${year}` : period
}

function fmt(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US")
}

function fmtSigned(value: number | null): string {
  if (value === null) return "—"
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}`
}

function fmtPercent(value: number | null): string {
  if (value === null) return "N/A"
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
}

function fmtDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { dateStyle: "medium" })
}

function statusClass(status: string | null): string {
  const normalized = (status ?? "").toLowerCase()
  if (normalized === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (normalized === "inactive") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "shared_email":
      return "Shared email"
    case "same_name":
      return "Same name"
    case "similar_name":
      return "Similar name"
    case "duplicate_id":
      return "Duplicate ID"
    default:
      return reason
  }
}

export default function FindMember() {
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [detail, setDetail] = useState<MemberDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setSearching(true)
    setSearchError(null)

    const trimmed = deferredQuery.trim()
    const url = `/api/members?q=${encodeURIComponent(trimmed)}&limit=50`

    fetch(url)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? `Search failed (${response.status})`)
        if (!active) return
        const list: SearchResult[] = Array.isArray(data.results) ? data.results : []
        setResults(list)
        setSelectedId((current) =>
          list.some((item) => item.memberId === current) ? current : list[0]?.memberId ?? "",
        )
      })
      .catch((cause) => {
        if (!active) return
        setResults([])
        setSearchError(cause instanceof Error ? cause.message : "Unable to search members")
      })
      .finally(() => {
        if (active) setSearching(false)
      })

    return () => {
      active = false
    }
  }, [deferredQuery])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }

    let active = true
    setDetailLoading(true)
    setDetailError(null)

    fetch(`/api/members/${encodeURIComponent(selectedId)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? `Unable to load member (${response.status})`)
        if (!active) return
        setDetail(data.member ?? null)
      })
      .catch((cause) => {
        if (!active) return
        setDetail(null)
        setDetailError(cause instanceof Error ? cause.message : "Unable to load the member")
      })
      .finally(() => {
        if (active) setDetailLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedId])

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold tracking-[0.18em] uppercase text-indigo-600">Member monitoring</div>
            <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-slate-900 mt-1">Find a member</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">Search saved member snapshots by LR Portal member ID, full name, or email. Results open a detail view with profile changes and download history.</p>
          </div>
          <div className="relative w-full sm:w-[340px]">
            <label htmlFor="find-member-search" className="sr-only">Search members</label>
            <input
              id="find-member-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Member ID, name, or email…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
            />
            <SearchIcon className="pointer-events-none absolute left-3 top-3 size-4 text-slate-500" />
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-600" aria-live="polite">
          {searching ? "Searching…" : `${results.length} member${results.length === 1 ? "" : "s"} found${deferredQuery.trim() ? ` for “${deferredQuery.trim()}”` : ""}`}
        </div>
        {searchError && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2">
            <AlertIcon className="size-4" />
            {searchError}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-4 items-start">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-bold text-slate-900">Members</div>
          <div className="max-h-[640px] overflow-auto divide-y divide-slate-100">
            {searching && !results.length && (
              <div className="p-4 space-y-2" aria-busy="true">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            )}
            {!searching && !results.length && !searchError && (
              <div className="p-6 text-center text-sm text-slate-600">No members match this search.</div>
            )}
            {results.map((result) => {
              const active = result.memberId === selectedId
              return (
                <button
                  key={result.memberId}
                  onClick={() => setSelectedId(result.memberId)}
                  aria-current={active ? "true" : undefined}
                  className={`w-full text-left px-4 py-3 transition focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{result.fullName ?? "Unnamed member"}</span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{fmtPeriod(result.reportingPeriod)}</span>
                  </div>
                  <div className="text-xs font-mono text-slate-600 truncate">{result.memberId}</div>
                  <div className="text-xs text-slate-600 truncate" title={result.email ?? ""}>{result.email ?? "No email"}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{fmt(result.totalDownloads)} downloads • {result.accountStatus ?? "status unknown"}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          {detailError && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex items-center gap-2">
              <AlertIcon className="size-4" />
              {detailError}
            </div>
          )}

          {!detail && !detailError && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center">
              {detailLoading ? (
                <div className="space-y-3" aria-busy="true">
                  <div className="h-5 w-40 bg-slate-100 rounded mx-auto animate-pulse" />
                  <div className="h-3 w-64 bg-slate-100 rounded mx-auto animate-pulse" />
                  <div className="h-24 w-full bg-slate-100 rounded-xl animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="text-sm font-semibold text-slate-800">Select a member</div>
                  <div className="text-xs text-slate-600 mt-1">Choose a search result to view their profile history.</div>
                </>
              )}
            </div>
          )}

          {detail && (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xl font-extrabold text-slate-900 truncate">{detail.fullName ?? "Unnamed member"}</div>
                    <div className="text-xs font-mono text-slate-600 mt-1">{detail.memberId}</div>
                  </div>
                  <span className={`text-xs font-semibold border rounded-full px-2.5 py-1 ${statusClass(detail.accountStatus)}`}>
                    {detail.accountStatus ?? "Status unknown"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</div><div className="text-slate-800 truncate" title={detail.email ?? ""}>{detail.email ?? "—"}</div></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Portal role</div><div className="text-slate-800 truncate">{detail.portalRole ?? "—"}</div></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Registered</div><div className="text-slate-800">{fmtDate(detail.registeredAt)}</div></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Snapshots seen</div><div className="text-slate-800">{detail.snapshotsSeen}</div></div>
                </div>
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                  Latest: <b className="text-slate-900">{fmtPeriod(detail.latest.reportingPeriod)}</b> • {detail.latest.originalFilename} • <b className="text-slate-900">{fmt(detail.latest.totalDownloads)}</b> downloads
                  {detail.latest.schoolName ? ` • ${detail.latest.schoolName}` : ""}
                </div>
                {detail.limitations.map((limitation) => (
                  <div key={limitation} className="mt-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 flex items-start gap-2">
                    <AlertIcon className="size-4 shrink-0 mt-0.5" />
                    <span>{limitation}</span>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <div className="text-sm font-bold text-slate-900">DOWNLOAD HISTORY</div>
                  <div className="text-xs text-slate-600">Total downloads recorded in each saved snapshot</div>
                </div>
                <div className="overflow-auto max-h-[360px]">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold">Period</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Downloads</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Difference</th>
                        <th className="text-right px-4 py-2.5 font-semibold">% Change</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Basis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.history.map((entry) => (
                        <tr key={entry.snapshotId} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{fmtPeriod(entry.reportingPeriod)}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{fmt(entry.totalDownloads)}</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-semibold ${entry.difference !== null && entry.difference > 0 ? "text-emerald-700" : entry.difference !== null && entry.difference < 0 ? "text-red-700" : "text-slate-600"}`}>{fmtSigned(entry.difference)}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{fmtPercent(entry.percentageChange)}</td>
                          <td className="px-4 py-2.5"><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${statusClass(entry.accountStatus)}`}>{entry.accountStatus ?? "—"}</span></td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 capitalize">{entry.downloadBasis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <div className="text-sm font-bold text-slate-900">PROFILE CHANGES</div>
                  <div className="text-xs text-slate-600">Field-level differences between consecutive snapshots</div>
                </div>
                <div className="p-4 space-y-3">
                  {detail.history.some((entry) => entry.changedFields.length) ? (
                    detail.history
                      .filter((entry) => entry.changedFields.length)
                      .map((entry) => (
                        <div key={entry.snapshotId} className="rounded-xl border border-slate-200 overflow-hidden">
                          <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">{fmtPeriod(entry.reportingPeriod)}</div>
                          <ul className="divide-y divide-slate-100">
                            {entry.changedFields.map((change) => (
                              <li key={change.field} className="px-3 py-2 text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-slate-800">{change.label}:</span>
                                <span className="line-through decoration-slate-400">{change.previous ?? "—"}</span>
                                <span aria-hidden="true">→</span>
                                <span className="font-medium text-slate-900">{change.current ?? "—"}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                  ) : (
                    <div className="text-sm text-slate-600">No profile changes detected across saved snapshots.</div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <div className="text-sm font-bold text-slate-900">SCHOOL ASSIGNMENT</div>
                    <div className="text-xs text-slate-600">Only shown when the export provides it</div>
                  </div>
                  <div className="p-4 text-sm">
                    {detail.latest.schoolName || detail.latest.districtName ? (
                      <div className="space-y-1">
                        <div><span className="text-slate-500">School:</span> <span className="font-medium text-slate-900">{detail.latest.schoolName ?? "—"}</span></div>
                        <div><span className="text-slate-500">District:</span> <span className="font-medium text-slate-900">{detail.latest.districtName ?? "—"}</span></div>
                      </div>
                    ) : (
                      <div className="text-slate-600">Assignment fields are not available in this export.</div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <div className="text-sm font-bold text-slate-900">DUPLICATE CASES</div>
                    <div className="text-xs text-slate-600">Advisory matches flagged for review</div>
                  </div>
                  <div className="p-4 text-sm">
                    {detail.duplicateCases.length ? (
                      <ul className="space-y-2">
                        {detail.duplicateCases.map((item) => (
                          <li key={item.id} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                            <div className="font-semibold text-slate-800">{reasonLabel(item.reason)} • {item.confidence} confidence</div>
                            <div className="text-slate-600">Other member <span className="font-mono">{item.otherMemberId}</span> • {item.status.replace(/_/g, " ")}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-slate-600">No duplicate cases recorded for this member.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
