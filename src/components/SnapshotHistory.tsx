import { useCallback, useEffect, useState } from "react"

type Module = "school" | "member"

interface Snapshot {
  id: string
  module: Module
  reporting_period: string
  export_date: string | null
  download_basis: string
  record_count: number
  created_at: string
  original_filename: string
  checksum_sha256: string
  size_bytes: number
  status: string
  uploaded_at: string
}

interface ValidationSummary {
  total: number
  accepted: number
  warnings: number
  rejected: number
}

interface PreviewResponse {
  file: { name: string; size: number; checksum: string }
  module: Module
  reportingPeriod: string
  exportDate: string | null
  validation: {
    summary: ValidationSummary
    missingHeaders: string[]
    extraHeaders: string[]
    limitations: string[]
  }
  duplicate: { id: string; status: string; uploadedAt: string } | null
}

interface Props {
  sourceFile: File | null
  module: Module | null
  reportingPeriod: string
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

export default function SnapshotHistory({ sourceFile, module, reportingPeriod }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/snapshots${module ? `?module=${module}` : ""}`)
      if (!response.ok) throw new Error(`Snapshot service returned ${response.status}`)
      const data = await response.json()
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load snapshots")
    } finally {
      setLoading(false)
    }
  }, [module])

  useEffect(() => {
    void load()
  }, [load])

  function buildForm(): FormData {
    const form = new FormData()
    if (sourceFile) form.set("file", sourceFile)
    if (module) form.set("module", module)
    form.set("reportingPeriod", reportingPeriod)
    form.set("exportDate", reportingPeriod)
    form.set("downloadBasis", "unknown")
    return form
  }

  async function handlePreview() {
    if (!sourceFile || !module) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch("/api/uploads/preview", { method: "POST", body: buildForm() })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Preview failed (${response.status})`)
      setPreview(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to preview the file")
    } finally {
      setSaving(false)
    }
  }

  async function handleCommit() {
    if (!sourceFile || !module) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch("/api/uploads/commit", { method: "POST", body: buildForm() })
      const data = await response.json()

      if (response.status === 409) {
        setPreview(null)
        setMessage("This file is already saved for the selected reporting period.")
        await load()
        return
      }

      if (!response.ok) throw new Error(data.error ?? `Save failed (${response.status})`)

      setPreview(null)
      setMessage(`Saved snapshot with ${data.snapshot.recordCount} records.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the snapshot")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-stone-900">SAVE CURRENT FILE AS SNAPSHOT</div>
            <div className="text-xs text-stone-600">Validates the loaded file, stores it in R2, and records it in D1.</div>
          </div>
          <button
            onClick={() => void handlePreview()}
            disabled={!sourceFile || !module || saving}
            className="px-4 py-2 rounded-full bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Working…" : "Preview snapshot"}
          </button>
        </div>
        <div className="p-4 text-xs text-stone-600">
          {sourceFile && module ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-stone-800">{sourceFile.name}</span>
              <span>•</span>
              <span>{module === "school" ? "School export" : "Member export"}</span>
              <span>•</span>
              <span>Period {reportingPeriod}</span>
              <span>•</span>
              <span>{formatBytes(sourceFile.size)}</span>
            </div>
          ) : (
            <div>Load a school or member export first, then preview and save it as a snapshot.</div>
          )}
          {error && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2">{error}</div>}
          {message && <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2">{message}</div>}
        </div>
      </div>

      {preview && (
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-stone-900">IMPORT PREVIEW</div>
              <div className="text-xs text-stone-600">{preview.file.name} • {preview.module} • {preview.reportingPeriod}</div>
            </div>
            <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-3 py-1">
              {preview.validation.summary.total} records
            </span>
          </div>
          <div className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3"><div className="text-stone-600">Accepted</div><div className="text-lg font-extrabold text-stone-900">{preview.validation.summary.accepted}</div></div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3"><div className="text-amber-700">Warnings</div><div className="text-lg font-extrabold text-amber-700">{preview.validation.summary.warnings}</div></div>
              <div className="rounded-xl bg-red-50 border border-red-200 p-3"><div className="text-red-700">Rejected</div><div className="text-lg font-extrabold text-red-700">{preview.validation.summary.rejected}</div></div>
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3"><div className="text-stone-600">Checksum</div><div className="font-mono text-[11px] truncate text-stone-800">{preview.file.checksum.slice(0, 12)}…</div></div>
            </div>
            {preview.validation.missingHeaders.length > 0 && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2">Missing columns: {preview.validation.missingHeaders.join(", ")}</div>}
            {preview.validation.limitations.map((limitation) => <div key={limitation} className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">{limitation}</div>)}
            {preview.duplicate && <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">Already uploaded on {formatDate(preview.duplicate.uploadedAt)}.</div>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => void handleCommit()} disabled={saving || preview.validation.summary.rejected > 0 || preview.validation.missingHeaders.length > 0 || !!preview.duplicate} className="px-4 py-2 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">Confirm save</button>
              <button onClick={() => setPreview(null)} disabled={saving} className="px-4 py-2 rounded-full border border-stone-200 bg-white font-medium hover:bg-stone-50 disabled:opacity-40">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-stone-900">SNAPSHOT HISTORY</div>
            <div className="text-xs text-stone-600">Saved reporting periods and import results</div>
          </div>
          <button onClick={() => void load()} disabled={loading} className="px-3 py-1.5 rounded-full border border-stone-200 bg-white text-xs font-semibold hover:bg-stone-50 disabled:opacity-40">{loading ? "Loading…" : "Refresh"}</button>
        </div>
        {snapshots.length ? (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Period</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Module</th>
                  <th className="text-left px-4 py-2.5 font-semibold">File</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Records</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Saved</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2.5 font-medium text-stone-800">{snapshot.reporting_period}</td>
                    <td className="px-4 py-2.5 capitalize">{snapshot.module}</td>
                    <td className="px-4 py-2.5 max-w-[280px] truncate" title={snapshot.original_filename}>{snapshot.original_filename}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{snapshot.record_count}</td>
                    <td className="px-4 py-2.5 text-stone-600">{formatDate(snapshot.uploaded_at)}</td>
                    <td className="px-4 py-2.5"><span className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">{snapshot.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-sm font-semibold text-stone-800">{loading ? "Loading snapshots…" : "No saved snapshots yet"}</div>
            <div className="text-xs text-stone-600 mt-1 max-w-lg mx-auto">Preview the loaded file above, then confirm the import to create the first baseline snapshot.</div>
          </div>
        )}
      </div>
    </div>
  )
}
