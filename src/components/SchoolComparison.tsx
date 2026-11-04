import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { SearchIcon } from "./icons"

interface Snapshot {
  id: string
  reporting_period: string
  export_date: string | null
  record_count: number
  created_at: string
  original_filename: string
}

type Category = "increased" | "decreased" | "no_change" | "new" | "missing" | "invalid"

interface ComparisonResult {
  schoolId: string
  schoolName: string | null
  previousDownloads: number | null
  currentDownloads: number | null
  difference: number | null
  percentageChange: number | null
  category: Category
}

interface ComparisonSummary {
  totalSchools: number
  previousSchools: number
  totalDownloads: number
  previousDownloads: number
  increased: number
  decreased: number
  noChange: number
  newSchools: number
  missingSchools: number
  invalid: number
}

interface ComparisonResponse {
  comparison: {
    id: string
    module: "school"
    previousSnapshot: Snapshot
    currentSnapshot: Snapshot
    summary: ComparisonSummary
    reused: boolean
  }
  results: ComparisonResult[]
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

function statusLabel(category: Category): string {
  switch (category) {
    case "increased":
      return "Increased"
    case "decreased":
      return "Decreased"
    case "no_change":
      return "No change"
    case "new":
      return "New"
    case "missing":
      return "Missing"
    default:
      return "Invalid"
  }
}

function statusClass(category: Category): string {
  switch (category) {
    case "increased":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "decreased":
      return "bg-red-50 text-red-700 border-red-200"
    case "no_change":
      return "bg-slate-100 text-slate-700 border-slate-200"
    case "new":
      return "bg-indigo-50 text-indigo-700 border-indigo-200"
    case "missing":
      return "bg-amber-50 text-amber-700 border-amber-200"
    default:
      return "bg-red-50 text-red-700 border-red-200"
  }
}

function formatPeriod(snapshot: Snapshot): string {
  return snapshot.export_date ?? snapshot.reporting_period
}

export default function SchoolComparison() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [currentId, setCurrentId] = useState("")
  const [previousId, setPreviousId] = useState("")
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | Category>("all")

  async function runComparison(current = currentId, previous = previousId) {
    if (!current || !previous) return
    setRunning(true)
    setError(null)
    try {
      const response = await fetch("/api/comparisons/school", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentSnapshotId: current, previousSnapshotId: previous }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Comparison failed (${response.status})`)
      setComparison(data)
    } catch (cause) {
      setComparison(null)
      setError(cause instanceof Error ? cause.message : "Unable to run the comparison")
    } finally {
      setRunning(false)
    }
  }

  const loadSnapshots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/snapshots?module=school")
      if (!response.ok) throw new Error(`Snapshot service returned ${response.status}`)
      const data = await response.json()
      const list: Snapshot[] = Array.isArray(data.snapshots) ? data.snapshots : []
      setSnapshots(list)

      if (list.length >= 2) {
        setCurrentId(list[0].id)
        setPreviousId(list[1].id)
        await runComparison(list[0].id, list[1].id)
      } else if (list.length === 1) {
        setCurrentId(list[0].id)
        setPreviousId("")
        setComparison(null)
      } else {
        setComparison(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load school snapshots")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (comparison?.results ?? []).filter((result) => {
      if (statusFilter !== "all" && result.category !== statusFilter) return false
      if (!query) return true
      return (
        result.schoolId.toLowerCase().includes(query) ||
        (result.schoolName ?? "").toLowerCase().includes(query)
      )
    })
  }, [comparison, search, statusFilter])

  const summary = comparison?.comparison.summary

  function exportCsv() {
    if (!comparison) return
    const rows = filtered.map((result) => ({
      "School ID": result.schoolId,
      "School Name": result.schoolName ?? "",
      "Previous Downloads": result.previousDownloads ?? "",
      "Current Downloads": result.currentDownloads ?? "",
      Difference: result.difference ?? "",
      "% Change": result.percentageChange === null ? "N/A" : result.percentageChange.toFixed(2),
      Status: statusLabel(result.category),
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `school-comparison-${comparison.comparison.currentSnapshot.reporting_period}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">SCHOOL DOWNLOAD COMPARISON</div>
            <div className="text-xs text-slate-600">Matched by School ID. Select two saved school snapshots.</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="previous-snapshot" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Previous</label>
              <select id="previous-snapshot" value={previousId} onChange={(event) => setPreviousId(event.target.value)} className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium max-w-[240px]">
                <option value="">Select previous snapshot</option>
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>{formatPeriod(snapshot)} • {snapshot.record_count} schools</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="current-snapshot" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Current</label>
              <select id="current-snapshot" value={currentId} onChange={(event) => setCurrentId(event.target.value)} className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium max-w-[240px]">
                <option value="">Select current snapshot</option>
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>{formatPeriod(snapshot)} • {snapshot.record_count} schools</option>
                ))}
              </select>
            </div>
            <button onClick={() => void runComparison()} disabled={!currentId || !previousId || running} className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
              {running ? "Comparing…" : "Run comparison"}
            </button>
            <button onClick={() => void loadSnapshots()} disabled={loading} className="px-3 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="p-4 text-xs">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</div>}
          {!error && snapshots.length < 2 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
              At least two school snapshots are required. Save another school export in Snapshot History first.
            </div>
          )}
          {comparison && (
            <div className="flex flex-wrap items-center gap-2 text-slate-600">
              <span className="font-semibold text-slate-900">{formatPeriod(comparison.comparison.previousSnapshot)}</span>
              <span>→</span>
              <span className="font-semibold text-slate-900">{formatPeriod(comparison.comparison.currentSnapshot)}</span>
              <span>•</span>
              <span>{comparison.comparison.currentSnapshot.original_filename}</span>
            </div>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Total Schools</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{summary.totalSchools.toLocaleString("en-US")}</div><div className="text-xs text-slate-600">previous {summary.previousSchools.toLocaleString("en-US")}</div></div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Current Downloads</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{summary.totalDownloads.toLocaleString("en-US")}</div><div className="text-xs text-slate-600">previous {summary.previousDownloads.toLocaleString("en-US")}</div></div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Increased</div><div className="text-2xl font-extrabold text-emerald-700 mt-1">{summary.increased}</div><div className="text-xs text-emerald-600">schools</div></div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-red-700">Decreased</div><div className="text-2xl font-extrabold text-red-700 mt-1">{summary.decreased}</div><div className="text-xs text-red-600">schools</div></div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">New</div><div className="text-2xl font-extrabold text-indigo-700 mt-1">{summary.newSchools}</div><div className="text-xs text-indigo-600">school records</div></div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Missing</div><div className="text-2xl font-extrabold text-amber-700 mt-1">{summary.missingSchools}</div><div className="text-xs text-amber-600">school records</div></div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <div className="relative">
            <label htmlFor="comparison-search" className="sr-only">Search schools</label>
            <input id="comparison-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search school or ID…" className="w-[240px] pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500" />
          </div>
          <label htmlFor="comparison-status" className="sr-only">Filter by status</label>
          <select id="comparison-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | Category)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium">
            <option value="all">All statuses</option>
            <option value="increased">Increased</option>
            <option value="decreased">Decreased</option>
            <option value="no_change">No change</option>
            <option value="new">New</option>
            <option value="missing">Missing</option>
            <option value="invalid">Invalid</option>
          </select>
          <span className="text-xs text-slate-600">{filtered.length.toLocaleString("en-US")} rows</span>
          <div className="ml-auto flex gap-2">
            <button onClick={exportCsv} disabled={!comparison} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">Export CSV</button>
            <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50">Print</button>
          </div>
        </div>
        {comparison ? (
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">School ID</th>
                  <th className="text-left px-3 py-2.5 font-semibold">School Name</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Previous</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Current</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Difference</th>
                  <th className="text-right px-3 py-2.5 font-semibold">% Change</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((result) => (
                  <tr key={result.schoolId} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">{result.schoolId}</td>
                    <td className="px-3 py-2 max-w-[320px] truncate font-medium text-slate-800" title={result.schoolName ?? ""}>{result.schoolName ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(result.previousDownloads)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(result.currentDownloads)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${result.difference !== null && result.difference > 0 ? "text-emerald-700" : result.difference !== null && result.difference < 0 ? "text-red-700" : "text-slate-600"}`}>{fmtSigned(result.difference)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtPercent(result.percentageChange)}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${statusClass(result.category)}`}>{statusLabel(result.category)}</span></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600">No rows match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-sm font-semibold text-slate-800">No comparison loaded</div>
            <div className="text-xs text-slate-600 mt-1 max-w-lg mx-auto">Save at least two school snapshots, then run the comparison to see increased, decreased, unchanged, new, and missing school records.</div>
          </div>
        )}
      </div>
    </div>
  )
}
