interface Env {
  DB: D1Database
}

interface SnapshotMeta {
  id: string
  reporting_period: string
  record_count: number
  original_filename: string
}

interface MemberRow {
  member_id: string
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  full_name_normalized: string | null
  email: string | null
  email_normalized: string | null
  account_status: string | null
  registered_at: string | null
}

type Reason = "duplicate_id" | "shared_email" | "same_name" | "similar_name"
type Confidence = "high" | "medium" | "low"
type ReviewStatus = "pending" | "confirmed" | "not_duplicate" | "resolved_external"

const REVIEW_STATUSES: ReviewStatus[] = ["pending", "confirmed", "not_duplicate", "resolved_external"]
const MAX_CASES = 500

interface Candidate {
  a: string
  b: string
  reason: Reason
  confidence: Confidence
  matchKey: string | null
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

function nameKey(record: MemberRow): string {
  if (record.full_name_normalized) return normalize(record.full_name_normalized)
  return normalize([record.last_name, record.first_name, record.middle_name].filter(Boolean).join(" "))
}

function displayName(record: MemberRow | undefined): string | null {
  if (!record) return null
  const name = [record.last_name, record.first_name, record.middle_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ")
  return name || null
}

function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      current[j] = value
      if (value < rowMin) rowMin = value
    }
    if (rowMin > max) return max + 1
    previous = current
  }
  return previous[b.length]
}

function groupBy(records: MemberRow[], keyFor: (record: MemberRow) => string): Map<string, MemberRow[]> {
  const groups = new Map<string, MemberRow[]>()
  for (const record of records) {
    const key = keyFor(record)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(record)
    else groups.set(key, [record])
  }
  return groups
}

function detectCandidates(records: MemberRow[]): Candidate[] {
  const candidates: Candidate[] = []
  const claimed = new Set<string>()
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

  const add = (left: MemberRow, right: MemberRow, reason: Reason, confidence: Confidence, matchKey: string | null) => {
    const [a, b] = left.member_id < right.member_id ? [left, right] : [right, left]
    const key = pairKey(a.member_id, b.member_id)
    if (claimed.has(key)) return
    claimed.add(key)
    candidates.push({ a: a.member_id, b: b.member_id, reason, confidence, matchKey })
  }

  for (const [email, group] of groupBy(records, (record) => normalize(record.email_normalized))) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        add(group[i], group[j], "shared_email", "high", email)
      }
    }
  }

  for (const [name, group] of groupBy(records, nameKey)) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        add(group[i], group[j], "same_name", "medium", name)
      }
    }
  }

  for (const [lastName, group] of groupBy(records, (record) => normalize(record.last_name))) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const left = group[i]
        const right = group[j]
        if (claimed.has(pairKey(left.member_id, right.member_id))) continue
        const leftName = nameKey(left)
        const rightName = nameKey(right)
        if (!leftName || !rightName || leftName === rightName) continue
        if (normalize(left.email_normalized) && normalize(left.email_normalized) === normalize(right.email_normalized)) continue
        if (levenshtein(leftName, rightName) <= 3) {
          add(left, right, "similar_name", "low", lastName)
        }
      }
    }
  }

  return candidates
}

async function getMemberSnapshot(db: D1Database, id: string): Promise<SnapshotMeta | null> {
  return db
    .prepare(
      `SELECT s.id, s.reporting_period, s.record_count, u.original_filename
       FROM snapshots s
       JOIN uploads u ON u.id = s.upload_id
       WHERE s.id = ? AND s.module = 'member'`,
    )
    .bind(id)
    .first<SnapshotMeta>()
}

async function getLatestMemberSnapshot(db: D1Database): Promise<SnapshotMeta | null> {
  return db
    .prepare(
      `SELECT s.id, s.reporting_period, s.record_count, u.original_filename
       FROM snapshots s
       JOIN uploads u ON u.id = s.upload_id
       WHERE s.module = 'member'
       ORDER BY s.reporting_period DESC, s.created_at DESC
       LIMIT 1`,
    )
    .first<SnapshotMeta>()
}

async function getMemberRecords(db: D1Database, snapshotId: string): Promise<MemberRow[]> {
  const result = await db
    .prepare(
      `SELECT member_id, last_name, first_name, middle_name, full_name_normalized, email,
              email_normalized, account_status, registered_at
       FROM member_snapshot_records
       WHERE snapshot_id = ?
       ORDER BY member_id`,
    )
    .bind(snapshotId)
    .all<MemberRow>()

  return result.results ?? []
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const snapshotParam = url.searchParams.get("snapshotId")
  const snapshot = snapshotParam
    ? await getMemberSnapshot(env.DB, snapshotParam)
    : await getLatestMemberSnapshot(env.DB)

  if (!snapshot) return jsonError("No member snapshot found. Upload a member export first.", 404)

  const statusParam = url.searchParams.get("status")
  if (statusParam && !REVIEW_STATUSES.includes(statusParam as ReviewStatus)) {
    return jsonError(`status must be one of ${REVIEW_STATUSES.join(", ")}`)
  }

  const statusClause = statusParam ? "AND c.status = ?" : ""
  const casesStatement = env.DB.prepare(
    `SELECT c.id, c.member_id_a, c.member_id_b, c.reason, c.confidence, c.status, c.match_key,
            c.note, c.created_at, c.reviewed_at,
            a.last_name AS a_last_name, a.first_name AS a_first_name, a.middle_name AS a_middle_name,
            a.email AS a_email, a.account_status AS a_status, a.registered_at AS a_registered_at,
            b.last_name AS b_last_name, b.first_name AS b_first_name, b.middle_name AS b_middle_name,
            b.email AS b_email, b.account_status AS b_status, b.registered_at AS b_registered_at
     FROM duplicate_review_cases c
     LEFT JOIN member_snapshot_records a ON a.snapshot_id = c.snapshot_id AND a.member_id = c.member_id_a
     LEFT JOIN member_snapshot_records b ON b.snapshot_id = c.snapshot_id AND b.member_id = c.member_id_b
     WHERE c.snapshot_id = ? ${statusClause}
     ORDER BY CASE c.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
              c.member_id_a, c.member_id_b
     LIMIT ?`,
  )
  const casesResult = statusParam
    ? await casesStatement.bind(snapshot.id, statusParam, MAX_CASES).all<Record<string, any>>()
    : await casesStatement.bind(snapshot.id, MAX_CASES).all<Record<string, any>>()

  const summaryRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN status = 'not_duplicate' THEN 1 ELSE 0 END) AS not_duplicate,
            SUM(CASE WHEN status = 'resolved_external' THEN 1 ELSE 0 END) AS resolved_external,
            SUM(CASE WHEN reason = 'shared_email' THEN 1 ELSE 0 END) AS shared_email,
            SUM(CASE WHEN reason = 'same_name' THEN 1 ELSE 0 END) AS same_name,
            SUM(CASE WHEN reason = 'similar_name' THEN 1 ELSE 0 END) AS similar_name,
            SUM(CASE WHEN reason = 'duplicate_id' THEN 1 ELSE 0 END) AS duplicate_id
     FROM duplicate_review_cases
     WHERE snapshot_id = ?`,
  )
    .bind(snapshot.id)
    .first<Record<string, number | null>>()

  const cases = (casesResult.results ?? []).map((row) => {
    const memberA: MemberRow = {
      member_id: row.member_id_a,
      last_name: row.a_last_name,
      first_name: row.a_first_name,
      middle_name: row.a_middle_name,
      full_name_normalized: null,
      email: row.a_email,
      email_normalized: null,
      account_status: row.a_status,
      registered_at: row.a_registered_at,
    }
    const memberB: MemberRow = {
      member_id: row.member_id_b,
      last_name: row.b_last_name,
      first_name: row.b_first_name,
      middle_name: row.b_middle_name,
      full_name_normalized: null,
      email: row.b_email,
      email_normalized: null,
      account_status: row.b_status,
      registered_at: row.b_registered_at,
    }
    return {
      id: row.id,
      reason: row.reason as Reason,
      confidence: row.confidence as Confidence,
      status: row.status as ReviewStatus,
      matchKey: row.match_key,
      note: row.note,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      memberA: {
        id: memberA.member_id,
        fullName: displayName(memberA),
        email: memberA.email,
        status: memberA.account_status,
        registeredAt: memberA.registered_at,
      },
      memberB: {
        id: memberB.member_id,
        fullName: displayName(memberB),
        email: memberB.email,
        status: memberB.account_status,
        registeredAt: memberB.registered_at,
      },
    }
  })

  return Response.json({
    snapshot,
    summary: {
      total: Number(summaryRow?.total ?? 0),
      pending: Number(summaryRow?.pending ?? 0),
      confirmed: Number(summaryRow?.confirmed ?? 0),
      notDuplicate: Number(summaryRow?.not_duplicate ?? 0),
      resolvedExternal: Number(summaryRow?.resolved_external ?? 0),
      sharedEmail: Number(summaryRow?.shared_email ?? 0),
      sameName: Number(summaryRow?.same_name ?? 0),
      similarName: Number(summaryRow?.similar_name ?? 0),
      duplicateId: Number(summaryRow?.duplicate_id ?? 0),
    },
    cases,
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { snapshotId?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const snapshot = body.snapshotId
    ? await getMemberSnapshot(env.DB, body.snapshotId)
    : await getLatestMemberSnapshot(env.DB)

  if (!snapshot) return jsonError("No member snapshot found. Upload a member export first.", 404)

  const records = await getMemberRecords(env.DB, snapshot.id)
  if (!records.length) return jsonError("The selected snapshot has no member records.", 422)

  const candidates = detectCandidates(records)
  const statements = candidates.map((candidate) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO duplicate_review_cases
        (id, module, member_id_a, member_id_b, reason, confidence, snapshot_id, match_key, status)
       VALUES (?, 'member', ?, ?, ?, ?, ?, ?, 'pending')`,
    ).bind(
      crypto.randomUUID(),
      candidate.a,
      candidate.b,
      candidate.reason,
      candidate.confidence,
      snapshot.id,
      candidate.matchKey,
    ),
  )

  const summary = {
    records: records.length,
    candidates: candidates.length,
    sharedEmail: candidates.filter((candidate) => candidate.reason === "shared_email").length,
    sameName: candidates.filter((candidate) => candidate.reason === "same_name").length,
    similarName: candidates.filter((candidate) => candidate.reason === "similar_name").length,
  }

  let inserted = 0
  try {
    for (const recordsChunk of chunk(statements, 250)) {
      const results = await env.DB.batch(recordsChunk)
      inserted += results.reduce((total, result) => total + (result.meta?.changes ?? 0), 0)
    }
  } catch {
    return jsonError("Unable to save detected duplicate cases.", 500)
  }

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, after_json)
     VALUES (?, 'duplicates.detect', 'snapshot', ?, ?)`,
  )
    .bind(crypto.randomUUID(), snapshot.id, JSON.stringify(summary))
    .run()
    .catch(() => undefined)

  return Response.json({ snapshot, summary: { ...summary, inserted } })
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let body: { id?: string; status?: string; note?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const id = String(body.id ?? "").trim()
  const status = String(body.status ?? "").trim() as ReviewStatus
  if (!id) return jsonError("id is required")
  if (!REVIEW_STATUSES.includes(status)) {
    return jsonError(`status must be one of ${REVIEW_STATUSES.join(", ")}`)
  }

  const existing = await env.DB.prepare(
    "SELECT id, status, note, member_id_a, member_id_b, reason, snapshot_id FROM duplicate_review_cases WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; status: string; note: string | null; member_id_a: string; member_id_b: string; reason: string; snapshot_id: string | null }>()

  if (!existing) return jsonError("Duplicate case not found", 404)

  const note = body.note === undefined || body.note === null ? existing.note : String(body.note).slice(0, 1000)

  await env.DB.prepare(
    `UPDATE duplicate_review_cases
     SET status = ?, note = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
  )
    .bind(status, note, id)
    .run()

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, before_json, after_json)
     VALUES (?, 'duplicates.review', 'duplicate_review_case', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      id,
      JSON.stringify({ status: existing.status, note: existing.note }),
      JSON.stringify({ status, note }),
    )
    .run()
    .catch(() => undefined)

  return Response.json({ case: { id, status, note } })
}
