import { useCallback, useEffect, useRef, useState } from "react"
import { detectModuleFromHeaders, parseWorkbookBuffer } from "../lib/workbook"
import { fmt, fmtPeriod, formatDate, type SchoolListItem, type SchoolsResponse } from "../lib/schools"
import { AlertIcon, CheckIcon, DataIcon, SchoolIcon, ShieldIcon, UploadIcon, UsersIcon } from "./icons"

type Module = "school" | "member"
type DownloadBasis = "cumulative" | "period" | "unknown"

interface PreviewResponse {
  file: { name: string; size: number; checksum: string }
  module: Module
  reportingPeriod: string
  exportDate: string | null
  schoolId: string | null
  detectedSchoolId: string | null
  school: { school_id: string; school_name: string; is_master: number; last_seen_period: string | null } | null
  schoolMatched: boolean
  emailSummary: { deped: number; nonDeped: number; invalid: number } | null
  validation: {
    missingHeaders: string[]
    extraHeaders: string[]
    limitations: string[]
    summary: { total: number; accepted: number; warnings: number; rejected: number }
  }
  duplicate: { id: string; status: string; uploadedAt: string } | null
  previewRows?: Array<{ data: Record<string, unknown>; status: string; errors?: string[]; warnings?: string[] }>
}

interface RecentUpload {
  id: string
  module: string
  originalFilename: string
  reportingPeriod: string
  uploadedAt: string
  status: string
  schoolId: string | null
  schoolName: string | null
  snapshot: { id: string; recordCount: number } | null
}

interface Props {
  onOpenSchool: (schoolId: string) => void
  onViewDirectory: () => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseSchoolIdFromName(name: string): string | null {
  const match = name.match(/deped-school-id-(\d+)/i)
  return match ? match[1] : null
}

function formatHeaderLabel(value: string): string {
  return value
    .trim()
    .replace(/[_\s]+/g, " ")
    .toLocaleLowerCase("en-US")
    .replace(/(^|\s)(\p{L})/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("en-US")}`)
    .replace(/\bId\b/g, "ID")
}

export default function ImportPanel({ onOpenSchool, onViewDirectory }: Props) {
  const [mode, setMode] = useState<Module>("school")
  const [file, setFile] = useState<File | null>(null)
  const [detectedModule, setDetectedModule] = useState<Module | null>(null)
  const [schoolId, setSchoolId] = useState("")
  const [detectedSchoolId, setDetectedSchoolId] = useState<string | null>(null)
  const [reportingPeriod, setReportingPeriod] = useState(currentMonth)
  const [exportDate, setExportDate] = useState(currentDate)
  const [downloadBasis, setDownloadBasis] = useState<DownloadBasis>("unknown")
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [savedSchoolId, setSavedSchoolId] = useState<string | null>(null)
  const [schools, setSchools] = useState<SchoolListItem[]>([])
  const [uploads, setUploads] = useState<RecentUpload[]>([])
  const [drag, setDrag] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadUploads = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await fetch("/api/uploads?limit=100")
      const payload = await response.json().catch(() => ({}))
      if (response.ok) {
        setUploads(Array.isArray(payload.uploads) ? payload.uploads : [])
      }
    } catch {
      setUploads([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadSchools() {
      try {
        const response = await fetch("/api/schools")
        const payload = await response.json().catch(() => ({}))
        if (response.ok && !cancelled) {
          setSchools((payload as SchoolsResponse).schools ?? [])
        }
      } catch {
        if (!cancelled) setSchools([])
      }
    }
    void loadSchools()
    void loadUploads()
    return () => { cancelled = true }
  }, [loadUploads])

  useEffect(() => {
    setPreview(null)
  }, [file, mode, reportingPeriod, exportDate, downloadBasis, schoolId])

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

    const detectedSchool = parseSchoolIdFromName(nextFile.name)
    setDetectedSchoolId(detectedSchool)

    try {
      const workbook = parseWorkbookBuffer(await nextFile.arrayBuffer(), nextFile.name)
      const firstSheet = workbook.sheets.find((sheet) => sheet.headers.length > 0)
      const detected = firstSheet ? detectModuleFromHeaders(firstSheet.headers) : null
      if (detected) {
        setMode(detected)
        setDetectedModule(detected)
      }
      if (detected === "member" && detectedSchool) setSchoolId(detectedSchool)
      if (detected === "school") setSchoolId("")
    } catch {
      setDetectedModule(null)
    }
  }

  function buildForm(): FormData {
    const form = new FormData()
    if (file) form.set("file", file)
    form.set("module", mode)
    form.set("reportingPeriod", reportingPeriod)
    form.set("exportDate", exportDate || reportingPeriod)
    form.set("downloadBasis", downloadBasis)
    if (mode === "member" && schoolId) form.set("schoolId", schoolId)
    return form
  }

  async function handlePreview() {
    if (!file) return
    setBusy("preview")
    setError(null)
    setMessage(null)
    setSavedSchoolId(null)
    try {
      const response = await fetch("/api/uploads/preview", { method: "POST", body: buildForm() })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Preview failed (${response.status})`)
      setPreview(data as PreviewResponse)
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : "Unable to preview the file")
    } finally {
      setBusy(null)
    }
  }

  async function handleCommit() {
    if (!file || !preview) return
    setBusy("commit")
    setError(null)
    setMessage(null)
    try {
      const response = await fetch("/api/uploads/commit", { method: "POST", body: buildForm() })
      const data = await response.json()

      if (response.status === 409) {
        setMessage(data.error ?? "This file was already saved for the selected reporting period.")
        await loadUploads()
        return
      }
      if (!response.ok) throw new Error(data.error ?? `Save failed (${response.status})`)

      const schoolName = data.school?.school_name ? ` for ${data.school.school_name}` : ""
      setMessage(`Saved ${data.snapshot.module === "school" ? "school list" : "user roster"}${schoolName} • ${fmtPeriod(data.snapshot.reportingPeriod)} • ${fmt(data.snapshot.recordCount)} records.`)
      setSavedSchoolId(data.snapshot.module === "member" ? data.school?.school_id ?? schoolId : null)
      setFile(null)
      setDetectedModule(null)
      setPreview(null)
      setDetectedSchoolId(null)
      if (fileRef.current) fileRef.current.value = ""
      await loadUploads()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the snapshot")
    } finally {
      setBusy(null)
    }
  }

  function resetUpload() {
    setFile(null)
    setDetectedModule(null)
    setDetectedSchoolId(null)
    setPreview(null)
    setError(null)
    setMessage(null)
    setSavedSchoolId(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDrag(false)
    const nextFile = event.dataTransfer.files?.[0]
    if (nextFile) void selectFile(nextFile)
  }

  const selectedSchool = schools.find((school) => school.schoolId === schoolId) ?? null
  const canCommit =
    Boolean(preview) &&
    !busy &&
    preview!.validation.summary.total > 0 &&
    preview!.validation.summary.rejected === 0 &&
    preview!.validation.missingHeaders.length === 0 &&
    !preview!.duplicate &&
    (mode === "school" || Boolean(schoolId))

  const relevantUploads = uploads.filter((upload) => upload.module === "member").slice(0, 15)

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[26px] border border-indigo-900 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white shadow-[0_24px_65px_-32px_rgba(30,27,75,0.8)]">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-44 left-1/3 size-80 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur"><UploadIcon className="size-7" /></div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300">Data import workspace</div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Uploads &amp; snapshots</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-indigo-100">Validate reporting files before saving them as utilization or school-roster snapshots.</p>
              </div>
            </div>
            <button onClick={onViewDirectory} className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/20"><SchoolIcon className="size-4" /> Open schools</button>
          </div>

          <div className="mt-6 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 p-1.5 backdrop-blur">
            {([
              ["school", "Utilization report", <DataIcon key="s" className="size-4" />],
              ["member", "School roster", <UsersIcon key="u" className="size-4" />],
            ] as Array<[Module, string, React.ReactNode]>).map(([value, label, icon]) => (
              <button key={value} onClick={() => { setMode(value); setPreview(null); setError(null); setMessage(null) }} aria-pressed={mode === value} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold ${mode === value ? "bg-white text-indigo-950 shadow-lg shadow-black/15" : "text-indigo-100 hover:bg-white/10 hover:text-white"}`}>
                {icon}{label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)]">
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="text-sm font-bold text-slate-950">{mode === "school" ? "Upload utilization report" : "Upload school roster"}</div>
            <div className="mt-0.5 text-xs text-slate-500">{mode === "school" ? "Division-wide user_count export with school utilization totals." : "One deped-school-id user export for a selected school."}</div>
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
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileRef.current?.click() } }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 ${drag ? "border-indigo-500 bg-indigo-50" : file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 bg-slate-50/70 hover:border-indigo-300 hover:bg-indigo-50/40"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div aria-hidden="true" className={`grid size-12 place-items-center rounded-2xl text-white shadow-lg ${file ? "bg-emerald-600 shadow-emerald-600/20" : "bg-indigo-600 shadow-indigo-600/20"}`}><UploadIcon className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-slate-900">{file ? file.name : "Drop an Excel or CSV file here"}</div>
                  <div className="text-xs text-slate-600 truncate">
                    {file ? `${formatBytes(file.size)} • ${mode === "school" ? "School list file" : "School users file"}${detectedModule ? " • auto-detected" : ""}` : "Supports .xls, .xlsx, and .csv"}
                  </div>
                </div>
                <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm">Browse files</span>
              </div>
              <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(event) => { const nextFile = event.target.files?.[0]; if (nextFile) void selectFile(nextFile) }} />
            </div>

            {mode === "member" && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  School
                  <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium">
                    <option value="">Select a school…</option>
                    {schools.map((school) => (
                      <option key={school.schoolId} value={school.schoolId}>{school.schoolName} ({school.schoolId}){school.isMaster ? "" : " — not in master list"}</option>
                    ))}
                  </select>
                </label>
                <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2">
                  {detectedSchoolId ? <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">Filename school: {detectedSchoolId}</span> : <span className="text-amber-700">No deped-school-id found in filename — select the school manually.</span>}
                  {selectedSchool && <span>Matched: <b className="text-slate-800">{selectedSchool.schoolName}</b>{selectedSchool.isMaster ? "" : " (extra school)"}</span>}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
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

            {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4" />{error}</div>}
            {message && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2 flex flex-wrap items-center gap-2"><CheckIcon className="size-4" />{message}{savedSchoolId && <button onClick={() => onOpenSchool(savedSchoolId)} className="ml-auto font-bold underline">Open school roster →</button>}</div>}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => void handlePreview()} disabled={!file || busy !== null} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-slate-900/15 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">{busy === "preview" ? "Validating…" : "Validate & preview"}</button>
              <button onClick={() => void handleCommit()} disabled={!canCommit} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/15 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{busy === "commit" ? "Saving…" : "Save snapshot"}</button>
              <button onClick={resetUpload} disabled={busy !== null} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Clear</button>
              {detectedModule && <span className="text-xs text-slate-600">Detected: <b className="text-slate-800">{detectedModule === "school" ? "school list" : "school users"}</b></span>}
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)]">
            <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><ShieldIcon className="size-4" /></span><div><div className="text-sm font-bold text-slate-950">Safe import workflow</div><div className="text-[11px] text-slate-500">Nothing is saved before validation</div></div></div>
            <ol className="mt-4 space-y-3 text-xs text-slate-600">
              {["Choose the correct report type and file.", "Confirm the school and reporting period.", "Validate the preview and resolve any errors.", "Save the approved snapshot."].map((step, index) => <li key={step} className="flex gap-3"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-900 text-[9px] font-bold text-white">{index + 1}</span><span>{step}</span></li>)}
            </ol>
          </section>

          <section className="rounded-[24px] border border-indigo-200 bg-indigo-50/70 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-950"><SchoolIcon className="size-4" /> Fixed school directory</div>
            <p className="mt-2 text-xs leading-relaxed text-indigo-900/75"><b>ListofSchool.xlsx</b> remains the master directory. Utilization uploads update metrics; roster uploads attach users to one school.</p>
            <button onClick={onViewDirectory} className="mt-4 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm hover:bg-indigo-100">View school directory</button>
          </section>
        </div>
      </div>

      {preview && (
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div>
              <div className="text-sm font-bold text-slate-950">Validation preview</div>
              <div className="text-xs text-slate-500">{preview.file.name} • {preview.module === "school" ? "Utilization report" : "School roster"} • {fmtPeriod(preview.reportingPeriod)}</div>
            </div>
            <span className={`text-xs font-semibold border rounded-full px-3 py-1 ${preview.validation.summary.total === 0 || preview.validation.summary.rejected > 0 || preview.validation.missingHeaders.length > 0 ? "bg-red-50 text-red-700 border-red-200" : preview.duplicate ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
              {preview.validation.summary.total === 0 || preview.validation.summary.rejected > 0 || preview.validation.missingHeaders.length > 0 ? "Fix required" : preview.duplicate ? "Duplicate" : "Ready to save"}
            </span>
          </div>

          <div className="space-y-3 p-4 text-xs sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewMetric label="Accepted" value={preview.validation.summary.accepted} tone="text-emerald-700" accent="bg-emerald-500" />
              <PreviewMetric label="Warnings" value={preview.validation.summary.warnings} tone="text-amber-700" accent="bg-amber-500" />
              <PreviewMetric label="Rejected" value={preview.validation.summary.rejected} tone="text-rose-700" accent="bg-rose-500" />
              <PreviewMetric label="Total rows" value={preview.validation.summary.total} tone="text-slate-950" accent="bg-slate-800" />
            </div>

            {preview.module === "member" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div className="font-bold text-slate-800">School assignment</div>
                {preview.schoolMatched && preview.school ? (
                  <div className="text-slate-700">Detected school: <b>{preview.school.school_name}</b> ({preview.school.school_id}){preview.school.is_master ? "" : " — extra school, not in master list"}</div>
                ) : preview.schoolId ? (
                  <div className="text-amber-700">School ID {preview.schoolId} is not in the master list. It will be added as an extra school.</div>
                ) : (
                  <div className="text-red-700">No school selected.</div>
                )}
                {preview.emailSummary && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">DepEd {fmt(preview.emailSummary.deped)}</span>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Non-DepEd {fmt(preview.emailSummary.nonDeped)}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-600">Missing/Invalid {fmt(preview.emailSummary.invalid)}</span>
                  </div>
                )}
              </div>
            )}

            {preview.validation.missingHeaders.length > 0 && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2">Missing columns: {preview.validation.missingHeaders.join(", ")}</div>}
            {preview.validation.limitations.map((limitation) => <div key={limitation} className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">{limitation}</div>)}
            {preview.duplicate && <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">This file was already saved on {formatDate(preview.duplicate.uploadedAt)}.</div>}

            {preview.previewRows && preview.previewRows.length > 0 && (
              <div className="max-h-[340px] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50/95">
                    <tr>
                      {Object.keys(preview.previewRows[0].data).slice(0, 7).map((header) => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-slate-600">{formatHeaderLabel(header)}</th>)}
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previewRows.slice(0, 10).map((row, index) => (
                      <tr key={index}>
                        {Object.keys(preview.previewRows?.[0].data ?? {}).slice(0, 7).map((header) => <td key={header} className="px-3 py-2 whitespace-nowrap max-w-[180px] truncate">{String(row.data[header] ?? "—")}</td>)}
                        <td className="px-3 py-2"><span className={`font-semibold ${row.status === "accepted" ? "text-emerald-700" : row.status === "warning" ? "text-amber-700" : "text-red-700"}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div>
            <div className="text-sm font-bold text-slate-950">Recent roster snapshots</div>
            <div className="text-xs text-slate-500">Newest per-school roster files only</div>
          </div>
          <button onClick={() => void loadUploads()} disabled={historyLoading} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-40">{historyLoading ? "Loading…" : "Refresh"}</button>
        </div>
        {relevantUploads.length ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Recent saved snapshots</caption>
              <thead className="border-b border-slate-200 bg-slate-50/90">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">School</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">File</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Records</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relevantUploads.map((upload) => (
                  <tr key={upload.id} className="transition-colors hover:bg-indigo-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{fmtPeriod(upload.reportingPeriod)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {upload.schoolId ? (
                        <button onClick={() => onOpenSchool(upload.schoolId!)} className="font-semibold text-indigo-700 hover:underline text-left">
                          {upload.schoolName ?? `School ${upload.schoolId}`}
                        </button>
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
          <div className="p-10 text-center"><div className="mx-auto grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500"><UploadIcon className="size-5" /></div><div className="mt-3 text-sm font-bold text-slate-800">No roster snapshots yet</div><div className="mt-1 text-xs text-slate-500">Upload a deped-school-id roster file above to begin school-level tracking.</div></div>
        )}
      </section>
    </div>
  )
}

function PreviewMetric({ label, value, tone, accent }: { label: string; value: number; tone: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <div className="text-[10px] font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-black ${tone}`}>{fmt(value)}</div>
    </div>
  )
}
