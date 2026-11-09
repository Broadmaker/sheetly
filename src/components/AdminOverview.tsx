import { useCallback, useEffect, useState } from "react"
import type { AppView } from "../lib/navigation"
import { AlertIcon, CheckIcon, CompareIcon, DuplicateIcon, SchoolIcon, TrendIcon, UploadIcon, UsersIcon } from "./icons"

type Module = "school" | "member"

interface Snapshot {
  id: string
  module: Module
  reporting_period: string
  record_count: number
  created_at: string
  original_filename: string
  uploaded_at: string
}

interface Health {
  status: string
  database: string
  storage: string
}

interface DuplicateSummary {
  total?: number
  pending?: number
}

interface Props {
  user: string
  onNavigate: (view: AppView) => void
  onOpenSnapshot: (id: string) => void
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { dateStyle: "medium" })
}

const QUICK_ACTIONS: Array<{ view: AppView; label: string; hint: string; icon: "upload" | "school" | "users" | "compare" | "duplicates" | "trends" }> = [
  { view: "uploads", label: "Upload Excel", hint: "Validate and save a snapshot", icon: "upload" },
  { view: "school", label: "School Analysis", hint: "Rankings and activity", icon: "school" },
  { view: "users", label: "User Analysis", hint: "Registered accounts", icon: "users" },
  { view: "comparison", label: "Compare Periods", hint: "School and member changes", icon: "compare" },
  { view: "duplicates", label: "Duplicate Review", hint: "Flagged account matches", icon: "duplicates" },
  { view: "trends", label: "Snapshot Trends", hint: "Monthly history", icon: "trends" },
]

function quickIcon(icon: (typeof QUICK_ACTIONS)[number]["icon"]) {
  switch (icon) {
    case "upload":
      return <UploadIcon className="size-5" />
    case "school":
      return <SchoolIcon className="size-5" />
    case "users":
      return <UsersIcon className="size-5" />
    case "compare":
      return <CompareIcon className="size-5" />
    case "duplicates":
      return <DuplicateIcon className="size-5" />
    default:
      return <TrendIcon className="size-5" />
  }
}

export default function AdminOverview({ user, onNavigate, onOpenSnapshot }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [snapshotResponse, healthResponse, duplicateResponse] = await Promise.all([
        fetch("/api/snapshots?limit=200"),
        fetch("/api/health"),
        fetch("/api/duplicates"),
      ])

      if (snapshotResponse.ok) {
        const data = await snapshotResponse.json()
        setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : [])
      }
      if (healthResponse.ok) setHealth(await healthResponse.json())
      if (duplicateResponse.ok) {
        const data = await duplicateResponse.json()
        setDuplicates(data.summary ?? null)
      } else {
        setDuplicates(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the admin overview")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const schoolSnapshots = snapshots.filter((snapshot) => snapshot.module === "school")
  const memberSnapshots = snapshots.filter((snapshot) => snapshot.module === "member")
  const totalRecords = snapshots.reduce((total, snapshot) => total + snapshot.record_count, 0)
  const latestUpload = [...snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  const latestSchool = schoolSnapshots[0] ?? null
  const latestMember = memberSnapshots[0] ?? null
  const serviceReady = health?.status === "ok"
  const pendingDuplicates = duplicates?.pending ?? 0

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 sm:px-6 py-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold tracking-[0.18em] uppercase text-indigo-600">Admin overview</div>
            <h1 className="text-[24px] sm:text-[28px] font-extrabold tracking-tight text-slate-900 mt-1">Welcome back, {user}</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">Monitor saved snapshots, review data quality, and jump straight into the analysis or import workflow.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading} className="px-3.5 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={() => onNavigate("uploads")} className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-2">
              <UploadIcon className="size-4" /> Upload & save snapshot
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4" />{error}</div>}

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
        <button onClick={() => onNavigate("duplicates")} className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Pending duplicates</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{pendingDuplicates}</div>
          <div className="text-xs text-slate-600 truncate">{duplicates ? `${duplicates.total ?? 0} total cases` : "No member snapshot yet"}</div>
        </button>
        <div className={`rounded-2xl p-4 border ${serviceReady ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className={`text-[11px] font-bold uppercase tracking-wide ${serviceReady ? "text-emerald-700" : "text-amber-700"}`}>Service</div>
          <div className={`text-lg font-extrabold mt-1 flex items-center gap-1.5 ${serviceReady ? "text-emerald-700" : "text-amber-700"}`}>
            {serviceReady ? <CheckIcon className="size-4" /> : <AlertIcon className="size-4" />}
            {health?.status ?? "Checking"}
          </div>
          <div className={`text-xs truncate ${serviceReady ? "text-emerald-600" : "text-amber-600"}`}>D1 {health?.database ?? "—"} • R2 {health?.storage ?? "—"}</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-900">Quick actions</h2>
          {latestUpload && <span className="text-xs text-slate-500">Latest upload {formatDate(latestUpload.uploaded_at)}</span>}
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.view}
              onClick={() => onNavigate(action.view)}
              className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-indigo-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500 flex items-center gap-3"
            >
              <span className="size-10 rounded-xl bg-indigo-50 text-indigo-600 grid place-items-center shrink-0">{quickIcon(action.icon)}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">{action.label}</span>
                <span className="block text-xs text-slate-600 truncate">{action.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">RECENT SNAPSHOTS</div>
            <div className="text-xs text-slate-600">Newest saved reporting periods</div>
          </div>
          <button onClick={() => onNavigate("uploads")} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50">Manage uploads</button>
        </div>
        {snapshots.length ? (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Period</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Module</th>
                  <th className="text-left px-4 py-2.5 font-semibold">File</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Records</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Saved</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshots.slice(0, 6).map((snapshot) => (
                  <tr key={snapshot.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{snapshot.reporting_period}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${snapshot.module === "school" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>{snapshot.module === "school" ? "School" : "Member"}</span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[320px] truncate" title={snapshot.original_filename}>{snapshot.original_filename}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{snapshot.record_count.toLocaleString("en-US")}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(snapshot.uploaded_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => onOpenSnapshot(snapshot.id)} className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500">Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-sm font-semibold text-slate-800">No snapshots saved yet</div>
            <div className="text-xs text-slate-600 mt-1">Upload your first school or member export to populate the dashboard.</div>
            <button onClick={() => onNavigate("uploads")} className="mt-3 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">Upload a file</button>
          </div>
        )}
      </div>
    </div>
  )
}
