import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { AlertIcon, SearchIcon, ShieldIcon } from "./icons"

interface AuditEntry {
  id: string
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  before: unknown
  after: unknown
  note: string | null
  createdAt: string
}

function fmtDateTime(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

function actionClass(action: string): string {
  if (action.startsWith("upload")) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (action.startsWith("duplicates")) return "bg-violet-50 text-violet-700 border-violet-200"
  if (action.startsWith("email_validation")) return "bg-sky-50 text-sky-700 border-sky-200"
  if (action.startsWith("email_policy")) return "bg-indigo-50 text-indigo-700 border-indigo-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState("")
  const [entityFilter, setEntityFilter] = useState("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/audit-logs?limit=500")
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `Audit log returned ${response.status}`)
      setLogs(Array.isArray(payload.logs) ? payload.logs : [])
    } catch (cause) {
      setLogs([])
      setError(cause instanceof Error ? cause.message : "Unable to load the audit log")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const entityTypes = useMemo(
    () => [...new Set(logs.map((entry) => entry.entityType))].sort(),
    [logs],
  )

  const filtered = useMemo(() => {
    const query = actionFilter.trim().toLowerCase()
    return logs.filter((entry) => {
      if (entityFilter !== "all" && entry.entityType !== entityFilter) return false
      if (!query) return true
      return (
        entry.action.toLowerCase().includes(query) ||
        entry.entityType.toLowerCase().includes(query) ||
        (entry.entityId ?? "").toLowerCase().includes(query) ||
        (entry.note ?? "").toLowerCase().includes(query)
      )
    })
  }, [logs, actionFilter, entityFilter])

  function exportCsv() {
    const rows = filtered.map((entry) => ({
      Time: entry.createdAt,
      Action: entry.action,
      "Entity Type": entry.entityType,
      "Entity ID": entry.entityId ?? "",
      "Before": describe(entry.before),
      "After": describe(entry.after),
      Note: entry.note ?? "",
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "audit-log.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold tracking-[0.18em] uppercase text-indigo-600">Governance</div>
            <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-slate-900 mt-1">Audit log</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">Read-only history of uploads, comparisons, duplicate reviews, email-policy changes, and validation runs, including before/after values where recorded.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading} className="px-3.5 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={exportCsv} disabled={!filtered.length} className="px-4 py-2 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">Export CSV</button>
          </div>
        </div>
        {error && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4" />{error}</div>}
        <div className="mt-3 text-xs text-slate-600">{logs.length.toLocaleString("en-US")} recorded events</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <ShieldIcon className="size-4 text-slate-500" />
          <div className="relative">
            <label htmlFor="audit-search" className="sr-only">Search audit log</label>
            <input id="audit-search" type="search" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} placeholder="Search action, entity, or id…" className="w-[260px] pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500" />
          </div>
          <label htmlFor="audit-entity" className="sr-only">Filter by entity type</label>
          <select id="audit-entity" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium">
            <option value="all">All entities</option>
            {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <span className="text-xs text-slate-600">{filtered.length.toLocaleString("en-US")} events</span>
        </div>

        {loading && !logs.length ? (
          <div className="p-4 space-y-2" aria-busy="true">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length ? (
          <div className="overflow-auto max-h-[640px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">Time</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Action</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Entity</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Entity ID</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Note</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 align-top">
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(entry.createdAt)}</td>
                    <td className="px-3 py-2.5"><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${actionClass(entry.action)}`}>{entry.action}</span></td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap">{entry.entityType}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600 max-w-[180px] truncate" title={entry.entityId ?? ""}>{entry.entityId ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[220px] truncate" title={entry.note ?? ""}>{entry.note ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {entry.before !== null || entry.after !== null ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-semibold text-indigo-600">View</summary>
                          <pre className="mt-2 max-w-[420px] max-h-[220px] overflow-auto rounded-lg bg-slate-50 border border-slate-200 p-2 text-[11px] leading-5 text-slate-700 whitespace-pre-wrap">{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-sm font-semibold text-slate-800">No audit events match the current filters</div>
            <div className="text-xs text-slate-600 mt-1">Events appear here as uploads, comparisons, reviews, and policy changes occur.</div>
          </div>
        )}
      </div>
    </div>
  )
}
