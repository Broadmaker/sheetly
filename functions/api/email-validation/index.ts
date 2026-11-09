import {
  classifyEmail,
  getActiveDomains,
  getPolicyVersion,
  type EmailClassification,
} from "../_lib/email-policy"

interface Env {
  DB: D1Database
}

interface SnapshotMeta {
  id: string
  reporting_period: string
  record_count: number
  original_filename: string
}

interface MemberRecord {
  id: string
  member_id: string
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  email: string | null
}

interface ResultRow {
  id: string
  email: string | null
  domain: string | null
  classification: EmailClassification
  policy_version: number
  note: string | null
  reviewed_at: string | null
  created_at: string
  member_id: string
  first_name: string | null
  last_name: string | null
  middle_name: string | null
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function displayName(row: { first_name: string | null; last_name: string | null; middle_name: string | null }): string | null {
  const name = [row.last_name, row.first_name, row.middle_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ")
  return name || null
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

const LATEST_RESULTS_CTE = `
  WITH ranked AS (
    SELECT e.id, e.email, e.domain, e.classification, e.policy_version, e.note, e.reviewed_at,
           e.created_at, r.member_id, r.first_name, r.last_name, r.middle_name,
           ROW_NUMBER() OVER (
             PARTITION BY e.member_snapshot_record_id
             ORDER BY e.policy_version DESC, e.created_at DESC
           ) AS rn
    FROM email_validation_results e
    JOIN member_snapshot_records r ON r.id = e.member_snapshot_record_id
    WHERE r.snapshot_id = ?
  )`

async function loadResults(db: D1Database, snapshotId: string) {
  const result = await db
    .prepare(
      `${LATEST_RESULTS_CTE}
       SELECT id, email, domain, classification, policy_version, note, reviewed_at, created_at,
              member_id, first_name, last_name, middle_name
       FROM ranked
       WHERE rn = 1
       ORDER BY CASE classification
         WHEN 'non_deped_domain' THEN 0
         WHEN 'invalid_missing' THEN 1
         WHEN 'needs_verification' THEN 2
         ELSE 3
       END, last_name, first_name
       LIMIT 1000`,
    )
    .bind(snapshotId)
    .all<ResultRow>()

  return (result.results ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    fullName: displayName(row),
    email: row.email,
    domain: row.domain,
    classification: row.classification,
    policyVersion: row.policy_version,
    note: row.note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }))
}

async function loadSummary(db: D1Database, snapshotId: string) {
  const result = await db
    .prepare(
      `${LATEST_RESULTS_CTE}
       SELECT classification, COUNT(*) AS count
       FROM ranked
       WHERE rn = 1
       GROUP BY classification`,
    )
    .bind(snapshotId)
    .all<{ classification: EmailClassification; count: number }>()

  const summary = {
    total: 0,
    depedDomain: 0,
    nonDepedDomain: 0,
    invalidMissing: 0,
    needsVerification: 0,
  }

  for (const row of result.results ?? []) {
    const count = Number(row.count ?? 0)
    summary.total += count
    if (row.classification === "deped_domain") summary.depedDomain = count
    else if (row.classification === "non_deped_domain") summary.nonDepedDomain = count
    else if (row.classification === "invalid_missing") summary.invalidMissing = count
    else if (row.classification === "needs_verification") summary.needsVerification = count
  }

  return summary
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const snapshotParam = url.searchParams.get("snapshotId")
  const snapshot = snapshotParam
    ? await getMemberSnapshot(env.DB, snapshotParam)
    : await getLatestMemberSnapshot(env.DB)

  if (!snapshot) return jsonError("No member snapshot found. Upload a member export first.", 404)

  const [results, summary, policyVersion, domains] = await Promise.all([
    loadResults(env.DB, snapshot.id),
    loadSummary(env.DB, snapshot.id),
    getPolicyVersion(env.DB),
    getActiveDomains(env.DB),
  ])

  return Response.json({
    snapshot,
    policyVersion,
    domains,
    summary,
    truncated: results.length >= 1000,
    results,
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

  const records = await env.DB.prepare(
    `SELECT id, member_id, first_name, last_name, middle_name, email
     FROM member_snapshot_records
     WHERE snapshot_id = ?`,
  )
    .bind(snapshot.id)
    .all<MemberRecord>()

  const rows = records.results ?? []
  if (!rows.length) return jsonError("The selected snapshot has no member records.", 422)

  const [policyVersion, domains] = await Promise.all([
    getPolicyVersion(env.DB),
    getActiveDomains(env.DB),
  ])

  const counts = {
    depedDomain: 0,
    nonDepedDomain: 0,
    invalidMissing: 0,
    needsVerification: 0,
  }

  const statements = rows.map((record) => {
    const { classification, domain } = classifyEmail(record.email, domains)
    if (classification === "deped_domain") counts.depedDomain++
    else if (classification === "non_deped_domain") counts.nonDepedDomain++
    else if (classification === "invalid_missing") counts.invalidMissing++
    else counts.needsVerification++

    return env.DB.prepare(
      `INSERT OR IGNORE INTO email_validation_results
        (id, member_snapshot_record_id, email, domain, classification, policy_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      record.id,
      record.email,
      domain,
      classification,
      policyVersion,
    )
  })

  try {
    for (const batch of chunk(statements, 250)) {
      await env.DB.batch(batch)
    }
  } catch {
    return jsonError("Unable to save email validation results.", 500)
  }

  const summary = {
    total: rows.length,
    ...counts,
  }

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, after_json)
     VALUES (?, 'email_validation.run', 'snapshot', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      snapshot.id,
      JSON.stringify({ policyVersion, domains, summary }),
    )
    .run()
    .catch(() => undefined)

  return Response.json({ snapshot, policyVersion, domains, summary })
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let body: { id?: string; note?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const id = String(body.id ?? "").trim()
  if (!id) return jsonError("id is required")
  const note = body.note === undefined || body.note === null ? null : String(body.note).slice(0, 1000)

  const existing = await env.DB.prepare(
    "SELECT id, note FROM email_validation_results WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; note: string | null }>()
  if (!existing) return jsonError("Email validation result not found", 404)

  await env.DB.prepare(
    `UPDATE email_validation_results
     SET note = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
  )
    .bind(note, id)
    .run()

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, before_json, after_json)
     VALUES (?, 'email_validation.review', 'email_validation_result', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      id,
      JSON.stringify({ note: existing.note }),
      JSON.stringify({ note }),
    )
    .run()
    .catch(() => undefined)

  return Response.json({ id, note })
}
