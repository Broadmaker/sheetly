import { useCallback, useEffect, useRef, useState } from "react"
import { detectModuleFromHeaders, parseWorkbookBuffer } from "../lib/workbook"
import { AlertIcon, CheckIcon, CircleIcon, UploadIcon } from "./icons"

type Module = "school" | "member"
type DownloadBasis = "cumulative" | "period" | "unknown"

interface Snapshot {
  id: string
  module: Module
  reporting_period: string
  export_date: string | null
  download_basis: string
  record_count: number
  created_at: string
  original_filename: string
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
  previewRows?: Array<{
    data: Record<string, unknown>
    status: string
    errors?: string[]
    warnings?: string[]
  }>
}

interface HealthResponse {
  status: string
  database: string
  storage: string
  timestamp: string
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
    previousSnapshot: Snapshot
    currentSnapshot: Snapshot
    summary: ComparisonSummary
  }
}

interface Props {
  onOpenComparison: () => void
  onBack: () => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AdminPanel({ onOpenComparison, onBack }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [module, setModule] = useState<Module>("school")
  const [detectedModule, setDetectedModule] = useState<Module | null>(null)
  const [reportingPeriod, setReportingPeriod] = useState(currentMonth)
  const [exportDate, setExportDate] = useState(currentDate)
  const [downloadBasis, setDownloadBasis] = useState<DownloadBasis>("unknown")
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null)
  const [busy, setBusy] = useState<"preview" | "commit" | "refresh" | "compare" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const schoolSnapshots = snapshots.filter((snapshot) => snapshot.module === "school")
  const memberSnapshots = snapshots.filter((snapshot) => snapshot.module === "member")
  const totalRecords = snapshots.reduce((total, snapshot) => total + snapshot.record_count, 0)
  const latestSnapshot = snapshots[0] ?? null
  const latestUpload = [...snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  const latestSchool = schoolSnapshots[0] ?? null
  const latestMember = memberSnapshots[0] ?? null
  const comparisonReady = schoolSnapshots.length >= 2

  const loadDashboard = useCallback(async () => {
    setBusy("refresh")
    try {
      const [snapshotResponse, healthResponse] = await Promise.all([
        fetch("/api/snapshots?limit=200"),
        fetch("/api/health"),
      ])

      if (snapshotResponse.ok) {
        const data = await snapshotResponse.json()
        setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : [])
      }
      if (healthResponse.ok) {
        setHealth(await healthResponse.json())
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load admin data")
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    setPreview(null)
  }, [file, module, reportingPeriod, exportDate, downloadBasis])

  async function selectFile(nextFile: File) {
    setError(null)
    setMessage(null)
    setPreview(null)
    setDetectedModule(null)
    setFile(nextFile)

    const match = nextFile.name.match(/(20\d{2})(\d{2})(\d{2})/)
    if (match) {
      setReportingPeriod(`${match[1]}-${match[2]}`)
      setExportDate(`${match[1]}-${match[2]}-${match[3]}`)
    }

    try {
      const workbook = parseWorkbookBuffer(await nextFile.arrayBuffer(), nextFile.name)
      const firstSheet = workbook.sheets.find((sheet) => sheet.headers.length > 0)
      const detected = firstSheet ? detectModuleFromHeaders(firstSheet.headers) : null
      if (detected) {
        setModule(detected)
        setDetectedModule(detected)
      }
    } catch {
      setDetectedModule(null)
    }
  }

  function buildForm(): FormData {
    const form = new FormData()
    if (file) form.set("file", file)
    form.set("module", module)
    form.set("reportingPeriod", reportingPeriod)
    form.set("exportDate", exportDate || reportingPeriod)
    form.set("downloadBasis", downloadBasis)
    return form
  }

  async function handlePreview() {
    if (!file) return
    setBusy("preview")
    setError(null)
    setMessage(null)
    try {
      const response = await fetch("/api/uploads/preview", { method: "POST", body: buildForm() })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Preview failed (${response.status})`)
      setPreview(data)
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : "Unable to preview the file")
    } finally {
      setBusy(null)
    }
  }

  async function runLatestComparison() {
    setBusy("compare")
    try {
      const response = await fetch("/api/comparisons/school", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Comparison failed (${response.status})`)
      setComparison(data)
    } catch (cause) {
      setComparison(null)
      setError(cause instanceof Error ? cause.message : "Unable to run the comparison")
    } finally {
      setBusy(null)
    }
  }

  async function handleCommit() {
    if (!file || !preview) return
    setBusy("commit")
    setError(null)
    setMessage(null)
    const hadSchoolSnapshot = schoolSnapshots.length > 0
    try {
      const response = await fetch("/api/uploads/commit", { method: "POST", body: buildForm() })
      const data = await response.json()

      if (response.status === 409) {
        setMessage(data.error ?? "This file was already saved for the selected reporting period.")
        await loadDashboard()
        return
      }

      if (!response.ok) throw new Error(data.error ?? `Save failed (${response.status})`)

      setMessage(
        `Saved ${data.snapshot.module} snapshot for ${data.snapshot.reportingPeriod} with ${data.snapshot.recordCount} records.`,
      )
      setFile(null)
      setDetectedModule(null)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ""
      await loadDashboard()

      if (module === "school" && hadSchoolSnapshot) {
        await runLatestComparison()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the snapshot")
    } finally {
      setBusy(null)
    }
  }

  function resetUpload() {
    setFile(null)
    setDetectedModule(null)
    setPreview(null)
    setError(null)
    setMessage(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDrag(false)
    const nextFile = event.dataTransfer.files?.[0]
    if (nextFile) void selectFile(nextFile)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 py-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold tracking-[0.18em] uppercase text-indigo-600">Admin workspace</div>
            <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-slate-900 mt-1">Upload, validate, and compare snapshots</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">Drop a school or member export, review the validation result, save an immutable snapshot, and compare school reporting periods.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void loadDashboard()} disabled={busy !== null} className="px-3 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
              {busy === "refresh" ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={onBack} className="px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">Back to report</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">School snapshots</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{schoolSnapshots.length}</div>
          <div className="text-xs text-slate-600 truncate">latest {latestSchool?.reporting_period ?? "—"}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Member snapshots</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{memberSnapshots.length}</div>
          <div className="text-xs text-slate-600 truncate">latest {latestMember?.reporting_period ?? "—"}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Stored records</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalRecords.toLocaleString("en-US")}</div>
          <div className="text-xs text-slate-600">{snapshots.length} saved snapshots</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Latest upload</div>
          <div className="text-lg font-extrabold text-slate-900 mt-1 truncate">{latestUpload?.reporting_period ?? "—"}</div>
          <div className="text-xs text-slate-600 truncate" title={latestUpload?.original_filename}>{latestUpload?.original_filename ?? "No uploads yet"}</div>
        </div>
        <div className={`rounded-2xl p-4 border ${health?.status === "ok" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className={`text-[11px] font-bold uppercase tracking-wide ${health?.status === "ok" ? "text-emerald-700" : "text-amber-700"}`}>Service</div>
          <div className={`text-lg font-extrabold mt-1 ${health?.status === "ok" ? "text-emerald-700" : "text-amber-700"}`}>{health?.status === "ok" ? "Ready" : "Check"}</div>
          <div className={`text-xs truncate ${health?.status === "ok" ? "text-emerald-600" : "text-amber-600"}`}>D1 {health?.database ?? "—"} • R2 {health?.storage ?? "—"}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-4 items-start">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="text-sm font-bold text-slate-900">UPLOAD FOR COMPARISON</div>
            <div className="text-xs text-slate-600">The module is detected from the file headers. You can override it before previewing.</div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop an Excel file here or press Enter to browse"
              onDragOver={(event) => { event.preventDefault(); setDrag(true) }}
              onDragEnter={(event) => { event.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={handleDrop}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  fileRef.current?.click()
                }
              }}
              onClick={() => fileRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-4 cursor-pointer outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div aria-hidden="true" className="size-11 rounded-2xl bg-indigo-600 text-white grid place-items-center"><UploadIcon className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 truncate">{file ? file.name : "Drop Excel here"}</div>
                  <div className="text-xs text-slate-600 truncate">
                    {file
                      ? `${formatBytes(file.size)} • ${module === "school" ? "School export" : "Member export"}${detectedModule ? " • auto-detected" : ""}`
                      : "Supports .xls, .xlsx, and .csv up to 25 MB"}
                  </div>
                </div>
                <span className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold">Choose file</span>
              </div>
              <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(event) => { const nextFile = event.target.files?.[0]; if (nextFile) void selectFile(nextFile) }} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-700">
                Module
                <select value={module} onChange={(event) => setModule(event.target.value as Module)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium">
                  <option value="school">School export</option>
                  <option value="member">Member export</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Reporting period
                <input type="month" value={reportingPeriod} onChange={(event) => setReportingPeriod(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium" />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Export date
                <input type="date" value={exportDate} onChange={(event) => setExportDate(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium" />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Download basis
                <select value={downloadBasis} onChange={(event) => setDownloadBasis(event.target.value as DownloadBasis)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium">
                  <option value="unknown">Unknown</option>
                  <option value="cumulative">Cumulative</option>
                  <option value="period">Period only</option>
                </select>
              </label>
            </div>

            {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>}
            {message && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2">{message}</div>}

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void handlePreview()} disabled={!file || busy !== null} className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy === "preview" ? "Validating…" : "Preview file"}
              </button>
              <button onClick={() => void handleCommit()} disabled={!preview || busy !== null || preview.validation.summary.total === 0 || preview.validation.summary.rejected > 0 || preview.validation.missingHeaders.length > 0 || !!preview.duplicate} className="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy === "commit" ? "Saving…" : "Save snapshot"}
              </button>
              <button onClick={resetUpload} disabled={busy !== null} className="px-4 py-2 rounded-full border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 disabled:opacity-40">Clear</button>
              {detectedModule && <span className="text-xs text-slate-600">Detected: <b className="text-slate-800">{detectedModule === "school" ? "school export" : "member export"}</b></span>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900">COMPARISON READINESS</div>
                <div className="text-xs text-slate-600">Uses the latest two school snapshots</div>
              </div>
              <button onClick={() => void runLatestComparison()} disabled={!comparisonReady || busy !== null} className="px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">
                {busy === "compare" ? "Comparing…" : "Compare"}
              </button>
            </div>
            <div className="p-4">
              {comparison ? (
                <div className="space-y-3">
                  <div className="text-xs text-slate-600">
                    <b className="text-slate-900">{comparison.comparison.previousSnapshot.reporting_period}</b>
                    <span className="mx-1">→</span>
                    <b className="text-slate-900">{comparison.comparison.currentSnapshot.reporting_period}</b>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2"><div className="text-emerald-700 font-semibold">Increased</div><div className="text-lg font-extrabold text-emerald-700">{comparison.comparison.summary.increased}</div></div>
                    <div className="rounded-xl bg-red-50 border border-red-200 p-2"><div className="text-red-700 font-semibold">Decreased</div><div className="text-lg font-extrabold text-red-700">{comparison.comparison.summary.decreased}</div></div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-2"><div className="text-slate-600 font-semibold">No change</div><div className="text-lg font-extrabold text-slate-800">{comparison.comparison.summary.noChange}</div></div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-2"><div className="text-amber-700 font-semibold">Missing</div><div className="text-lg font-extrabold text-amber-700">{comparison.comparison.summary.missingSchools}</div></div>
                  </div>
                  <div className="text-xs text-slate-600">Current downloads: <b className="text-slate-900">{comparison.comparison.summary.totalDownloads.toLocaleString("en-US")}</b></div>
                  <button onClick={onOpenComparison} className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">Open full comparison</button>
                </div>
              ) : (
                <div className="text-xs text-slate-600">
                  {comparisonReady ? (
                    <div className="space-y-2">
                      <div>Ready to compare <b className="text-slate-900">{schoolSnapshots[1]?.reporting_period}</b> with <b className="text-slate-900">{schoolSnapshots[0]?.reporting_period}</b>.</div>
                      <div className="text-slate-500">Click Compare to load the latest result.</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="font-semibold text-slate-800">Two school snapshots are required.</div>
                      <div>Save another school export to unlock increased, decreased, new, and missing statistics.</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-slate-900">ADMIN CHECKLIST</div>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2"><span className={schoolSnapshots.length >= 2 ? "text-emerald-600" : "text-slate-400"}>{schoolSnapshots.length >= 2 ? <CheckIcon className="size-4" /> : <CircleIcon className="size-4" />}</span>Two school snapshots saved</div>
              <div className="flex items-center gap-2"><span className={latestSnapshot ? "text-emerald-600" : "text-slate-400"}>{latestSnapshot ? <CheckIcon className="size-4" /> : <CircleIcon className="size-4" />}</span>At least one snapshot saved</div>
              <div className="flex items-center gap-2"><span className={health?.status === "ok" ? "text-emerald-600" : "text-amber-600"}>{health?.status === "ok" ? <CheckIcon className="size-4" /> : <AlertIcon className="size-4" />}</span>D1 and R2 available</div>
              <div className="flex items-center gap-2"><span className={comparison ? "text-emerald-600" : "text-slate-400"}>{comparison ? <CheckIcon className="size-4" /> : <CircleIcon className="size-4" />}</span>Comparison generated</div>
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">IMPORT PREVIEW</div>
              <div className="text-xs text-slate-600">{preview.file.name} • {preview.module} • {preview.reportingPeriod}</div>
            </div>
            <span className={`text-xs font-semibold border rounded-full px-3 py-1 ${preview.validation.summary.total === 0 || preview.validation.summary.rejected > 0 || preview.validation.missingHeaders.length > 0 ? "bg-red-50 text-red-700 border-red-200" : preview.duplicate ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
              {preview.validation.summary.total === 0 || preview.validation.summary.rejected > 0 || preview.validation.missingHeaders.length > 0 ? "Fix required" : preview.duplicate ? "Duplicate" : "Ready to save"}
            </span>
          </div>
          <div className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="text-slate-600">Accepted</div><div className="text-lg font-extrabold text-slate-900">{preview.validation.summary.accepted}</div></div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3"><div className="text-amber-700">Warnings</div><div className="text-lg font-extrabold text-amber-700">{preview.validation.summary.warnings}</div></div>
              <div className="rounded-xl bg-red-50 border border-red-200 p-3"><div className="text-red-700">Rejected</div><div className="text-lg font-extrabold text-red-700">{preview.validation.summary.rejected}</div></div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="text-slate-600">Checksum</div><div className="font-mono text-[11px] truncate text-slate-800">{preview.file.checksum.slice(0, 12)}…</div></div>
            </div>
            {preview.validation.missingHeaders.length > 0 && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2">Missing columns: {preview.validation.missingHeaders.join(", ")}</div>}
            {preview.validation.limitations.map((limitation) => <div key={limitation} className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">{limitation}</div>)}
            {preview.duplicate && <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">This file was already saved on {formatDate(preview.duplicate.uploadedAt)}.</div>}
            {preview.previewRows && preview.previewRows.length > 0 && (
              <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {Object.keys(preview.previewRows[0].data).slice(0, 6).map((header) => <th key={header} className="text-left px-3 py-2 font-semibold whitespace-nowrap">{header}</th>)}
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previewRows.slice(0, 5).map((row, index) => (
                      <tr key={index}>
                        {Object.keys(preview.previewRows?.[0].data ?? {}).slice(0, 6).map((header) => <td key={header} className="px-3 py-2 whitespace-nowrap max-w-[180px] truncate">{String(row.data[header] ?? "—")}</td>)}
                        <td className="px-3 py-2"><span className={`font-semibold ${row.status === "accepted" ? "text-emerald-700" : "text-amber-700"}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">RECENT SNAPSHOTS</div>
            <div className="text-xs text-slate-600">Newest reporting periods first</div>
          </div>
          <span className="text-xs text-slate-600">{snapshots.length} saved</span>
        </div>
        {snapshots.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Period</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Module</th>
                  <th className="text-left px-4 py-2.5 font-semibold">File</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Records</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshots.slice(0, 12).map((snapshot) => (
                  <tr key={snapshot.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{snapshot.reporting_period}</td>
                    <td className="px-4 py-2.5"><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${snapshot.module === "school" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>{snapshot.module === "school" ? "School" : "Member"}</span></td>
                    <td className="px-4 py-2.5 max-w-[320px] truncate" title={snapshot.original_filename}>{snapshot.original_filename}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{snapshot.record_count.toLocaleString("en-US")}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(snapshot.uploaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-600">No snapshots saved yet. Upload a file above to create the first one.</div>
        )}
      </div>
    </div>
  )
}
