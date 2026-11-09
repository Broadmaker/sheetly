import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { AlertIcon, MailIcon, SearchIcon } from "./icons"

interface Snapshot {
  id: string
  reporting_period: string
  record_count: number
  original_filename: string
}

type Classification = "deped_domain" | "non_deped_domain" | "invalid_missing" | "needs_verification"

interface ValidationResult {
  id: string
  memberId: string
  fullName: string | null
  email: string | null
  domain: string | null
  classification: Classification
  policyVersion: number
  note: string | null
  reviewedAt: string | null
  createdAt: string
}

interface Summary {
  total: number
  depedDomain: number
  nonDepedDomain: number
  invalidMissing: number
  needsVerification: number
}

interface Domain {
  id: string
  domain: string
  active: boolean
  policyVersion: number
  createdAt: string
}

interface PolicyResponse {
  version: number
  domains: Domain[]
}

interface ResultsResponse {
  snapshot: Snapshot
  policyVersion: number
  domains: string[]
  summary: Summary
  truncated: boolean
  results: ValidationResult[]
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

function classificationLabel(classification: Classification): string {
  switch (classification) {
    case "deped_domain":
      return "DepEd domain"
    case "non_deped_domain":
      return "Non-DepEd domain"
    case "invalid_missing":
      return "Invalid / missing"
    case "needs_verification":
      return "Needs verification"
  }
}

function classificationClass(classification: Classification): string {
  switch (classification) {
    case "deped_domain":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "non_deped_domain":
      return "bg-amber-50 text-amber-800 border-amber-200"
    case "invalid_missing":
      return "bg-red-50 text-red-700 border-red-200"
    case "needs_verification":
      return "bg-sky-50 text-sky-700 border-sky-200"
  }
}

export default function EmailValidation() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotId, setSnapshotId] = useState("")
  const [policy, setPolicy] = useState<PolicyResponse>({ version: 1, domains: [] })
  const [data, setData] = useState<ResultsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [policyDirty, setPolicyDirty] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [savingDomain, setSavingDomain] = useState(false)
  const [search, setSearch] = useState("")
  const [classificationFilter, setClassificationFilter] = useState<"all" | Classification>("all")

  const loadPolicy = useCallback(async () => {
    const response = await fetch("/api/email-policy")
    if (!response.ok) throw new Error(`Email policy service returned ${response.status}`)
    const payload = await response.json()
    setPolicy({
      version: Number(payload.version ?? 1),
      domains: Array.isArray(payload.domains) ? payload.domains : [],
    })
  }, [])

  const loadResults = useCallback(async (id: string) => {
    if (!id) {
      setData(null)
      return
    }
    const response = await fetch(`/api/email-validation?snapshotId=${encodeURIComponent(id)}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error ?? `Validation results returned ${response.status}`)
    setData(payload)
    setPolicyDirty(false)
  }, [])

  const loadSnapshots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await loadPolicy()
      const response = await fetch("/api/snapshots?module=member")
      if (!response.ok) throw new Error(`Snapshot service returned ${response.status}`)
      const payload = await response.json()
      const list: Snapshot[] = Array.isArray(payload.snapshots) ? payload.snapshots : []
      setSnapshots(list)
      const nextId = list[0]?.id ?? ""
      setSnapshotId((current) => (list.some((snapshot) => snapshot.id === current) ? current : nextId))
      if (nextId) await loadResults(nextId)
      else setData(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load email validation data")
    } finally {
      setLoading(false)
    }
  }, [loadPolicy, loadResults])

  useEffect(() => {
    void loadSnapshots()
  }, [loadSnapshots])

  async function changeSnapshot(id: string) {
    setSnapshotId(id)
    if (!id) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await loadResults(id)
    } catch (cause) {
      setData(null)
      setError(cause instanceof Error ? cause.message : "Unable to load validation results")
    } finally {
      setLoading(false)
    }
  }

  async function runValidation() {
    if (!snapshotId) return
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/email-validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `Validation failed (${response.status})`)
      await loadResults(snapshotId)
      await loadPolicy()
      setNotice(`Validation complete for ${payload.summary?.total ?? 0} members using policy v${payload.policyVersion}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run email validation")
    } finally {
      setRunning(false)
    }
  }

  async function addDomain() {
    const domain = newDomain.trim()
    if (!domain) return
    setSavingDomain(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/email-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `Unable to add domain (${response.status})`)
      setPolicy({ version: payload.version, domains: payload.domains })
      setNewDomain("")
      setPolicyDirty(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add the domain")
    } finally {
      setSavingDomain(false)
    }
  }

  async function toggleDomain(domain: Domain) {
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/email-policy", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: domain.id, active: !domain.active }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `Unable to update the domain (${response.status})`)
      setPolicy({ version: payload.version, domains: payload.domains })
      setPolicyDirty(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the domain")
    }
  }

  async function saveNote(result: ValidationResult, note: string) {
    if ((result.note ?? "") === note) return
    try {
      const response = await fetch("/api/email-validation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: result.id, note }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `Unable to save the note (${response.status})`)
      setData((current) =>
        current
          ? {
              ...current,
              results: current.results.map((row) =>
                row.id === result.id
                  ? { ...row, note: payload.note, reviewedAt: new Date().toISOString() }
                  : row,
              ),
            }
          : current,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the note")
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.results ?? []).filter((result) => {
      if (classificationFilter !== "all" && result.classification !== classificationFilter) return false
      if (!query) return true
      return (
        result.memberId.toLowerCase().includes(query) ||
        (result.fullName ?? "").toLowerCase().includes(query) ||
        (result.email ?? "").toLowerCase().includes(query) ||
        (result.domain ?? "").toLowerCase().includes(query)
      )
    })
  }, [data, search, classificationFilter])

  const summary = data?.summary

  function exportCsv() {
    if (!data) return
    const rows = filtered.map((result) => ({
      "Member ID": result.memberId,
      Name: result.fullName ?? "",
      Email: result.email ?? "",
      Domain: result.domain ?? "",
      Classification: classificationLabel(result.classification),
      "Policy Version": result.policyVersion,
      "Review Note": result.note ?? "",
      "Reviewed At": result.reviewedAt ?? "",
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `email-validation-${data.snapshot.reporting_period}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold tracking-[0.18em] uppercase text-indigo-600">Member monitoring</div>
            <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-slate-900 mt-1">Email validation</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">Flag member accounts whose email domain is outside the approved DepEd policy. Validation is advisory and never deactivates accounts.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="email-validation-snapshot" className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Member snapshot</label>
              <select id="email-validation-snapshot" value={snapshotId} onChange={(event) => void changeSnapshot(event.target.value)} className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium max-w-[280px]">
                {!snapshots.length && <option value="">No member snapshots</option>}
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>{fmtPeriod(snapshot.reporting_period)} • {snapshot.record_count} members</option>
                ))}
              </select>
            </div>
            <button onClick={() => void runValidation()} disabled={!snapshotId || running} className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40">
              {running ? "Validating…" : "Run validation"}
            </button>
            <button onClick={() => void loadSnapshots()} disabled={loading} className="px-3 py-2 rounded-full border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-600" aria-live="polite">
          {data ? <>Validated <b className="text-slate-900">{data.snapshot.original_filename}</b> • {fmtPeriod(data.snapshot.reporting_period)} • policy v{data.policyVersion}</> : "Run validation to classify member emails for the selected snapshot."}
        </div>
        {error && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-center gap-2"><AlertIcon className="size-4" />{error}</div>}
        {notice && <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-2">{notice}</div>}
        {policyDirty && <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">Policy changed. Run validation again to apply policy v{policy.version}.</div>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">APPROVED EMAIL DOMAINS</div>
            <div className="text-xs text-slate-600">Policy v{policy.version} • {policy.domains.filter((domain) => domain.active).length} active</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="new-approved-domain" className="sr-only">Approved domain</label>
            <input id="new-approved-domain" type="text" value={newDomain} onChange={(event) => setNewDomain(event.target.value)} placeholder="deped.gov.ph" className="w-[200px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
            <button onClick={() => void addDomain()} disabled={savingDomain || !newDomain.trim()} className="px-3 py-2 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">
              {savingDomain ? "Adding…" : "Add domain"}
            </button>
          </div>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {policy.domains.length ? (
            policy.domains.map((domain) => (
              <button key={domain.id} onClick={() => void toggleDomain(domain)} aria-pressed={domain.active} title={domain.active ? "Click to deactivate" : "Click to activate"} className={`text-xs font-semibold border rounded-full px-3 py-1.5 transition ${domain.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200 line-through"}`}>
                {domain.domain}
              </button>
            ))
          ) : (
            <div className="text-sm text-slate-600">No approved domains configured. Add one so matching emails can be classified automatically.</div>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Members checked</div><div className="text-2xl font-extrabold text-slate-900 mt-1">{summary.total.toLocaleString("en-US")}</div><div className="text-xs text-slate-600">policy v{data?.policyVersion}</div></div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">DepEd domain</div><div className="text-2xl font-extrabold text-emerald-700 mt-1">{summary.depedDomain.toLocaleString("en-US")}</div><div className="text-xs text-emerald-600">approved</div></div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Non-DepEd domain</div><div className="text-2xl font-extrabold text-amber-800 mt-1">{summary.nonDepedDomain.toLocaleString("en-US")}</div><div className="text-xs text-amber-700">needs review</div></div>
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-red-700">Invalid / missing</div><div className="text-2xl font-extrabold text-red-700 mt-1">{summary.invalidMissing.toLocaleString("en-US")}</div><div className="text-xs text-red-600">{summary.needsVerification} need verification</div></div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <MailIcon className="size-4 text-slate-500" />
          <div className="relative">
            <label htmlFor="email-validation-search" className="sr-only">Search results</label>
            <input id="email-validation-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, name, email, domain…" className="w-[260px] pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm" />
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-500" />
          </div>
          <label htmlFor="email-validation-classification" className="sr-only">Filter by classification</label>
          <select id="email-validation-classification" value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value as "all" | Classification)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium">
            <option value="all">All classifications</option>
            <option value="non_deped_domain">Non-DepEd domain</option>
            <option value="invalid_missing">Invalid / missing</option>
            <option value="needs_verification">Needs verification</option>
            <option value="deped_domain">DepEd domain</option>
          </select>
          <span className="text-xs text-slate-600">{filtered.length.toLocaleString("en-US")} rows</span>
          <div className="ml-auto flex gap-2">
            <button onClick={exportCsv} disabled={!data} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">Export CSV</button>
            <button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50">Print</button>
          </div>
        </div>
        {data ? (
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">Member ID</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Name</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Email</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Domain</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Classification</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Review note</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Reviewed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((result) => (
                  <tr key={result.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">{result.memberId}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate font-medium text-slate-800" title={result.fullName ?? ""}>{result.fullName ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={result.email ?? ""}>{result.email ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate text-slate-600">{result.domain ?? "—"}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${classificationClass(result.classification)}`}>{classificationLabel(result.classification)}</span></td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        defaultValue={result.note ?? ""}
                        onBlur={(event) => void saveNote(result, event.target.value.trim())}
                        placeholder="Add note…"
                        aria-label={`Review note for ${result.fullName ?? result.memberId}`}
                        className="w-[180px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{fmtDate(result.reviewedAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600">No rows match the current filters. Run validation or adjust the filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-sm font-semibold text-slate-800">{snapshots.length ? "No validation results loaded" : "No member snapshots yet"}</div>
            <div className="text-xs text-slate-600 mt-1 max-w-lg mx-auto">{snapshots.length ? "Run validation to classify member emails against the configured policy." : "Upload a member export in Uploads & Snapshots before validating emails."}</div>
          </div>
        )}
      </div>

      {data?.truncated && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">Showing the first 1,000 classified members. Use search or export for the full set.</div>
      )}
    </div>
  )
}
