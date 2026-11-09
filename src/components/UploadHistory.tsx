import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { AlertIcon, HistoryIcon, SearchIcon } from "./icons"

interface ValidationSummary {
  total?: number
  accepted?: number
  warnings?: number
  rejected?: number
}

interface UploadRecord {
  id: string
  module: "school" | "member"
  originalFilename: string
  checksum: string
  sizeBytes: number
  reportingPeriod: string
  exportDate: string | null
  uploadedAt: string
  status: string
  validation: { summary?: ValidationSummary; limitations?: string[] } | null
  snapshot: {
    id: string
    recordCount: number
    downloadBasis: string | null
    createdAt: string
  } | null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function fmtPeriod(period: string): string {
  const [year, month] = period.split("-")
  const index = Number(month) - 1
  return index >= 0 && index < 12 ? `${MONTHS[index]} ${year}` : period
}

function fmtDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { dateStyle: "medium" })
}

function fmtDateTime(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

function fmtBytes(value: number): string {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function statusClass(status: string): string {
  if (status === "committed") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200"
  if (status === "superseded") return "bg-slate-100 text-slate-600 border-slate-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

export default function UploadHistory() {
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moduleFilter, setModuleFilter] = useState<"all" | "school" | "member">("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/uploads?limit=500")
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `Upload history returned ${response.status}`)
      setUploads(Array.isArray(payload.uploads) ? payload.uploads : [])
    } catch (cause) {
      setUploads([])
      setError(cause instanceof Error ? cause.message : "Unable to load upload history")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return uploads.filter((upload) => {
      if (moduleFilter !== "all" && upload.module !== moduleFilter) return false
      if (statusFilter !== "all" && upload.status !== statusFilter) return false
      if (!query) return true
      return (
        upload.originalFilename.toLowerCase().includes(query) ||
        upload.reportingPeriod.toLowerCase().includes(query) ||
        upload.id.toLowerCase().includes(query)
      )
    })
  }, [uploads, moduleFilter, statusFilter, search])

  const totals = useMemo(() => {
    return {
      all: uploads.length,
      school: uploads.filter((upload) => upload.module === "school").length,
      member: uploads.filter((upload) => upload.module === "member").length,
      records: uploads.reduce((total, upload) => total + (upload.snapshot?.recordCount ?? 0), 0),
    }
  }, [uploads])

  function exportCsv() {
    const rows = filtered.map((upload) => ({
      "Upload ID": upload.id,
      Module: upload.module,
      "Original File": upload.originalFilename,
      Period: upload.reportingPeriod,
      "Export Date": upload.exportDate ?? "",
      Uploaded: upload.uploadedAt,
      Status: upload.status,
      Records: upload.snapshot?.recordCount ?? "",
      "Download Basis": upload.snapshot?.downloadBasis ?? "",
      Accepted: upload.validation?.summary?.accepted ?? "",
      Warnings: upload.validation?.summary?.warnings ?? "",
      Rejected: upload.validation?.summary?.rejected ?? "",
      Checksum: upload.checksum,
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "upload-history.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold tracking-[0.18em] uppercase text-indigo-600">Records</div>
            <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-slate-900 mt-1">Upload history</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">Every committed import is preserved with its original file, checksum, reporting period, validation result, and snapshot. Earlier uploads are never overwritten.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading} className="px-3.5 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={exportCsv} disabled={!filtered.length} className="px-4 py-2 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">Export CSV</button>
          </div>
        </div>
        {error && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4" />{error}</div>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Uploads</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{totals.all.toLocaleString("en-US")}</div><div className="text-xs text-slate-600">preserved imports</div></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">School</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{totals.school.toLocaleString("en-US")}</div><div className="text-xs text-slate-600">school exports</div></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Member</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{totals.member.toLocaleString("en-US")}</div><div className="text-xs text-slate-600">member exports</div></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Stored records</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{totals.records.toLocaleString("en-US")}</div><div className="text-xs text-slate-600">across snapshots</div></div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <HistoryIcon className="size-4 text-slate-500" />
          <div className="relative">
            <label htmlFor="upload-history-search" className="sr-only">Search uploads</label>
            <input id="upload-history-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search file, period, or id…" className="w-[240px] pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500" />
          </div>
          <label htmlFor="upload-history-module" className="sr-only">Filter by module</label>
          <select id="upload-history-module" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value as "all" | "school" | "member")} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium">
            <option value="all">All modules</option>
            <option value="school">School</option>
            <option value="member">Member</option>
          </select>
          <label htmlFor="upload-history-status" className="sr-only">Filter by status</label>
          <select id="upload-history-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium">
            <option value="all">All statuses</option>
            <option value="committed">Committed</option>
            <option value="rejected">Rejected</option>
            <option value="superseded">Superseded</option>
          </select>
          <span className="text-xs text-slate-600">{filtered.length.toLocaleString("en-US")} rows</span>
        </div>

        {loading && !uploads.length ? (
          <div className="p-4 space-y-2" aria-busy="true">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length ? (
          <div className="overflow-auto max-h-[620px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">Uploaded</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Module</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Period</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Original file</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Size</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Records</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Validation</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                  <th className="text-right px-3 py-2.5 font-semibold">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((upload) => {
                  const summary = upload.validation?.summary
                  return (
                    <tr key={upload.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(upload.uploadedAt)}</td>
                      <td className="px-3 py-2.5"><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${upload.module === "school" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>{upload.module === "school" ? "School" : "Member"}</span></td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{fmtPeriod(upload.reportingPeriod)}</td>
                      <td className="px-3 py-2.5 max-w-[280px] truncate" title={upload.originalFilename}>{upload.originalFilename}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmtBytes(upload.sizeBytes)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{(upload.snapshot?.recordCount ?? 0).toLocaleString("en-US")}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{summary ? `${summary.accepted ?? 0} ok • ${summary.warnings ?? 0} warn • ${summary.rejected ?? 0} rej` : "—"}</td>
                      <td className="px-3 py-2.5"><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${statusClass(upload.status)}`}>{upload.status}</span></td>
                      <td className="px-3 py-2.5 text-right">
                        <a href={`/api/uploads/${encodeURIComponent(upload.id)}`} className="inline-flex px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">Download</a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-sm font-semibold text-slate-800">No uploads match the current filters</div>
            <div className="text-xs text-slate-600 mt-1">Import a school or member export from Uploads &amp; Snapshots to populate the history.</div>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-600">Export date, file name, checksum, snapshot date, and validation summary are retained for audit. Snapshot saved: {fmtDate(uploads[0]?.snapshot?.createdAt ?? null)}</div>
    </div>
  )
}
