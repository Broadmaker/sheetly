import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertIcon, CheckIcon, SearchIcon } from "./icons"

interface Snapshot {
  id: string
  reporting_period: string
  record_count: number
  original_filename: string
}

type Reason = "duplicate_id" | "shared_email" | "same_name" | "similar_name"
type Confidence = "high" | "medium" | "low"
type ReviewStatus = "pending" | "confirmed" | "not_duplicate" | "resolved_external"

interface DuplicateMember {
  id: string
  fullName: string | null
  email: string | null
  status: string | null
  registeredAt: string | null
}

interface DuplicateCase {
  id: string
  reason: Reason
  confidence: Confidence
  status: ReviewStatus
  matchKey: string | null
  note: string | null
  createdAt: string
  reviewedAt: string | null
  memberA: DuplicateMember
  memberB: DuplicateMember
}

interface Summary {
  total: number
  pending: number
  confirmed: number
  notDuplicate: number
  resolvedExternal: number
  sharedEmail: number
  sameName: number
  similarName: number
  duplicateId: number
}

const PAGE_SIZE = 10

function reasonLabel(reason: Reason): string {
  switch (reason) {
    case "shared_email":
      return "Shared email"
    case "same_name":
      return "Same name"
    case "similar_name":
      return "Similar name"
    default:
      return "Duplicate ID"
  }
}

function reasonClass(reason: Reason): string {
  switch (reason) {
    case "shared_email":
      return "bg-red-50 text-red-700 border-red-200"
    case "same_name":
      return "bg-amber-50 text-amber-700 border-amber-200"
    case "similar_name":
      return "bg-slate-100 text-slate-700 border-slate-200"
    default:
      return "bg-red-50 text-red-700 border-red-200"
  }
}

function confidenceClass(confidence: Confidence): string {
  switch (confidence) {
    case "high":
      return "bg-red-600 text-white border-red-600"
    case "medium":
      return "bg-amber-500 text-white border-amber-500"
    default:
      return "bg-slate-500 text-white border-slate-500"
  }
}

function statusLabel(status: ReviewStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmed duplicate"
    case "not_duplicate":
      return "Not a duplicate"
    case "resolved_external":
      return "Resolved externally"
    default:
      return "Pending review"
  }
}

function statusClass(status: ReviewStatus): string {
  switch (status) {
    case "confirmed":
      return "bg-red-50 text-red-700 border-red-200"
    case "not_duplicate":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "resolved_external":
      return "bg-indigo-50 text-indigo-700 border-indigo-200"
    default:
      return "bg-amber-50 text-amber-700 border-amber-200"
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { dateStyle: "medium" })
}

function formatPeriod(snapshot: Snapshot): string {
  return snapshot.reporting_period
}

function MemberPanel({ label, member }: { label: string; member: DuplicateMember }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900 truncate" title={member.fullName ?? ""}>{member.fullName ?? "—"}</div>
      <div className="text-xs text-slate-600 font-mono">ID {member.id}</div>
      <div className="mt-1 text-xs text-slate-600 truncate" title={member.email ?? ""}>{member.email ?? "No email"}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${member.status?.toLowerCase() === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{member.status ?? "Unknown"}</span>
        <span className="text-[11px] text-slate-500">Registered {formatDate(member.registeredAt)}</span>
      </div>
    </div>
  )
}

function CaseCard({ item, onSaved }: { item: DuplicateCase; onSaved: () => void }) {
  const [status, setStatus] = useState<ReviewStatus>(item.status)
  const [note, setNote] = useState(item.note ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = status !== item.status || note !== (item.note ?? "")

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/duplicates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, status, note }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Save failed (${response.status})`)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the review")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <span className={`text-[11px] font-bold border rounded-full px-2 py-0.5 ${reasonClass(item.reason)}`}>{reasonLabel(item.reason)}</span>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${confidenceClass(item.confidence)}`}>{item.confidence} confidence</span>
        <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
        {item.matchKey && <span className="text-[11px] text-slate-500 truncate max-w-[220px]" title={item.matchKey}>Match: {item.matchKey}</span>}
        <span className="ml-auto text-[11px] text-slate-500">Flagged {formatDate(item.createdAt)}</span>
      </div>
      <div className="p-4 grid sm:grid-cols-2 gap-3">
        <MemberPanel label="Member A" member={item.memberA} />
        <MemberPanel label="Member B" member={item.memberB} />
      </div>
      <div className="px-4 pb-4 flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`note-${item.id}`} className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Review note</label>
          <input id={`note-${item.id}`} type="text" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional explanation" className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus-visible:ring-2 focus-visible:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor={`status-${item.id}`} className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Review status</label>
          <select id={`status-${item.id}`} value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)} className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium">
            <option value="pending">Pending review</option>
            <option value="confirmed">Confirmed duplicate</option>
            <option value="not_duplicate">Not a duplicate</option>
            <option value="resolved_external">Resolved externally</option>
          </select>
        </div>
        <button onClick={() => void save()} disabled={!dirty || saving} className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? "Saving…" : "Save review"}
        </button>
      </div>
      {item.reviewedAt && <div className="px-4 pb-3 text-[11px] text-slate-500">Last reviewed {formatDate(item.reviewedAt)}</div>}
      {error && <div className="mx-4 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>}
    </div>
  )
}

export default function DuplicateReview() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotId, setSnapshotId] = useState("")
  const [cases, setCases] = useState<DuplicateCase[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("all")
  const [reasonFilter, setReasonFilter] = useState<"all" | Reason>("all")
  const [page, setPage] = useState(1)

  const fetchCases = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/duplicates?snapshotId=${encodeURIComponent(id)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Duplicate service returned ${response.status}`)
      setCases(Array.isArray(data.cases) ? data.cases : [])
      setSummary(data.summary ?? null)
    } catch (cause) {
      setCases([])
      setSummary(null)
      setError(cause instanceof Error ? cause.message : "Unable to load duplicate cases")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSnapshots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/snapshots?module=member")
      if (!response.ok) throw new Error(`Snapshot service returned ${response.status}`)
      const data = await response.json()
      const list: Snapshot[] = Array.isArray(data.snapshots) ? data.snapshots : []
      setSnapshots(list)
      setSnapshotId((current) => (current && list.some((snapshot) => snapshot.id === current) ? current : list[0]?.id ?? ""))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load member snapshots")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  useEffect(() => {
    if (snapshotId) void fetchCases(snapshotId)
  }, [snapshotId, fetchCases])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, reasonFilter, snapshotId])

  async function runDetection() {
    if (!snapshotId) return
    setDetecting(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch("/api/duplicates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Detection failed (${response.status})`)
      setMessage(`Checked ${data.summary.records} members — ${data.summary.inserted} new case(s) from ${data.summary.candidates} candidate pair(s).`)
      await fetchCases(snapshotId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run duplicate detection")
    } finally {
      setDetecting(false)
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return cases.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false
      if (reasonFilter !== "all" && item.reason !== reasonFilter) return false
      if (!query) return true
      return (
        item.memberA.id.toLowerCase().includes(query) ||
        item.memberB.id.toLowerCase().includes(query) ||
        (item.memberA.fullName ?? "").toLowerCase().includes(query) ||
        (item.memberB.fullName ?? "").toLowerCase().includes(query) ||
        (item.memberA.email ?? "").toLowerCase().includes(query) ||
        (item.memberB.email ?? "").toLowerCase().includes(query)
      )
    })
  }, [cases, search, statusFilter, reasonFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">DUPLICATE ACCOUNT REVIEW</div>
            <div className="text-xs text-slate-600">Cautious detection by shared email, matching name, and similar name. No accounts are merged or deleted.</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="duplicate-snapshot" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Member snapshot</label>
              <select id="duplicate-snapshot" value={snapshotId} onChange={(event) => setSnapshotId(event.target.value)} className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium max-w-[260px]">
                {snapshots.length ? snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>{formatPeriod(snapshot)} • {snapshot.record_count} members</option>
                )) : <option value="">No member snapshots</option>}
              </select>
            </div>
            <button onClick={() => void runDetection()} disabled={!snapshotId || detecting} className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
              {detecting ? "Detecting…" : "Run detection"}
            </button>
            <button onClick={() => void fetchCases(snapshotId)} disabled={!snapshotId || loading} className="px-3 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="p-4 text-xs space-y-2">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4 shrink-0" />{error}</div>}
          {message && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 flex items-center gap-2"><CheckIcon className="size-4 shrink-0" />{message}</div>}
          {!error && !snapshots.length && <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">No member snapshots yet. Save a member export in Snapshot History to run duplicate detection.</div>}
          {snapshotId && !error && <div className="text-slate-600">Reviewing <b className="text-slate-800">{snapshots.find((snapshot) => snapshot.id === snapshotId)?.original_filename ?? "snapshot"}</b> • detection is advisory and requires human confirmation.</div>}
        </div>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Total cases</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{summary.total}</div></div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Pending</div><div className="text-2xl font-extrabold text-amber-700 mt-1">{summary.pending}</div></div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-red-700">Confirmed</div><div className="text-2xl font-extrabold text-red-700 mt-1">{summary.confirmed}</div></div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Not a duplicate</div><div className="text-2xl font-extrabold text-emerald-700 mt-1">{summary.notDuplicate}</div></div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Resolved externally</div><div className="text-2xl font-extrabold text-indigo-700 mt-1">{summary.resolvedExternal}</div></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center"><div className="text-xs text-slate-600">Shared email</div><div className="text-lg font-extrabold text-slate-900">{summary.sharedEmail}</div></div>
            <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center"><div className="text-xs text-slate-600">Same name</div><div className="text-lg font-extrabold text-slate-900">{summary.sameName}</div></div>
            <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center"><div className="text-xs text-slate-600">Similar name</div><div className="text-lg font-extrabold text-slate-900">{summary.similarName}</div></div>
          </div>
        </>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <div className="relative">
            <label htmlFor="duplicate-search" className="sr-only">Search duplicate cases</label>
            <input id="duplicate-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, name, or email…" className="w-[240px] pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500" />
          </div>
          <label htmlFor="duplicate-status-filter" className="sr-only">Filter by review status</label>
          <select id="duplicate-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | ReviewStatus)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium">
            <option value="all">All statuses</option>
            <option value="pending">Pending review</option>
            <option value="confirmed">Confirmed duplicate</option>
            <option value="not_duplicate">Not a duplicate</option>
            <option value="resolved_external">Resolved externally</option>
          </select>
          <label htmlFor="duplicate-reason-filter" className="sr-only">Filter by reason</label>
          <select id="duplicate-reason-filter" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value as "all" | Reason)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium">
            <option value="all">All reasons</option>
            <option value="shared_email">Shared email</option>
            <option value="same_name">Same name</option>
            <option value="similar_name">Similar name</option>
          </select>
          <span className="text-xs text-slate-600">{filtered.length.toLocaleString("en-US")} cases</span>
        </div>

        <div className="p-4 space-y-3">
          {loading && !cases.length ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">{[1,2,3].map((index) => <div key={index} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
          ) : paged.length ? (
            paged.map((item) => <CaseCard key={item.id} item={item} onSaved={() => void fetchCases(snapshotId)} />)
          ) : (
            <div className="py-10 text-center">
              <div className="text-sm font-semibold text-slate-800">{cases.length ? "No cases match the filters" : "No duplicate cases yet"}</div>
              <div className="text-xs text-slate-600 mt-1 max-w-md mx-auto">{cases.length ? "Adjust the search or filters to see more results." : "Run detection on a member snapshot to flag shared emails, matching names, and similar names for review."}</div>
            </div>
          )}
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40">‹ Prev</button>
              <span className="px-3 py-1 rounded-full bg-white border">Page {page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="px-3 py-1 rounded-full border bg-white disabled:opacity-40">Next ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
