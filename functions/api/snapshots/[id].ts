interface Env {
  DB: D1Database
}

interface SnapshotMeta {
  id: string
  module: "school" | "member"
  reporting_period: string
  export_date: string | null
  download_basis: string
  record_count: number
  created_at: string
  original_filename: string
  uploaded_at: string
}

interface SchoolRecord {
  school_id: string
  school_name: string | null
  registered_users: number | null
  actual_users: number | null
  participation_rate: number | null
  downloads: number | null
  raw_json: string
}

interface MemberRecord {
  member_id: string
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  gender: string | null
  account_status: string | null
  email: string | null
  portal_role: string | null
  total_downloads: number | null
  registered_at: string | null
  raw_json: string
}

const SCHOOL_HEADERS = [
  "SCHOOL ID",
  "SCHOOL NAME",
  "REGISTERED USERS",
  "ACTUAL USERS",
  "PARTICIPATION RATE",
  "DOWNLOADS",
]

const MEMBER_HEADERS = [
  "ID",
  "LAST NAME",
  "FIRST NAME",
  "MIDDLE NAME",
  "GENDER",
  "STATUS",
  "EMAIL",
  "PORTAL ROLE",
  "TOTAL DOWNLOADS",
  "REGISTERED",
]

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

function headerKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function parseRow(rawJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawJson)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = String(params.id ?? "").trim()
  if (!id) return jsonError("Snapshot id is required")

  const snapshot = await env.DB.prepare(
    `SELECT s.id, s.module, s.reporting_period, s.export_date, s.download_basis,
            s.record_count, s.created_at, u.original_filename, u.uploaded_at
     FROM snapshots s
     JOIN uploads u ON u.id = s.upload_id
     WHERE s.id = ?`,
  )
    .bind(id)
    .first<SnapshotMeta>()

  if (!snapshot) return jsonError("Snapshot not found", 404)

  const canonical = snapshot.module === "school" ? SCHOOL_HEADERS : MEMBER_HEADERS
  const canonicalKeys = new Set(canonical.map(headerKey))
  const extraHeaders: string[] = []
  const seenExtras = new Set<string>()
  const rows: Record<string, unknown>[] = []

  if (snapshot.module === "school") {
    const result = await env.DB.prepare(
      `SELECT school_id, school_name, registered_users, actual_users, participation_rate,
              downloads, raw_json
       FROM school_snapshot_records
       WHERE snapshot_id = ?
       ORDER BY school_name, school_id`,
    )
      .bind(id)
      .all<SchoolRecord>()

    for (const record of result.results ?? []) {
      const raw = parseRow(record.raw_json)
      const row: Record<string, unknown> = {
        "SCHOOL ID": record.school_id,
        "SCHOOL NAME": record.school_name ?? "",
        "REGISTERED USERS": record.registered_users ?? "",
        "ACTUAL USERS": record.actual_users ?? "",
        "PARTICIPATION RATE": record.participation_rate ?? "",
        "DOWNLOADS": record.downloads ?? "",
      }
      for (const [key, value] of Object.entries(raw)) {
        if (!key || canonicalKeys.has(headerKey(key))) continue
        row[key] = value
        if (!seenExtras.has(key)) {
          seenExtras.add(key)
          extraHeaders.push(key)
        }
      }
      rows.push(row)
    }
  } else {
    const result = await env.DB.prepare(
      `SELECT member_id, last_name, first_name, middle_name, gender, account_status,
              email, portal_role, total_downloads, registered_at, raw_json
       FROM member_snapshot_records
       WHERE snapshot_id = ?
       ORDER BY member_id`,
    )
      .bind(id)
      .all<MemberRecord>()

    for (const record of result.results ?? []) {
      const raw = parseRow(record.raw_json)
      const row: Record<string, unknown> = {
        "ID": record.member_id,
        "LAST NAME": record.last_name ?? "",
        "FIRST NAME": record.first_name ?? "",
        "MIDDLE NAME": record.middle_name ?? "",
        "GENDER": record.gender ?? "",
        "STATUS": record.account_status ?? "",
        "EMAIL": record.email ?? "",
        "PORTAL ROLE": record.portal_role ?? "",
        "TOTAL DOWNLOADS": record.total_downloads ?? "",
        "REGISTERED": record.registered_at ?? "",
      }
      for (const [key, value] of Object.entries(raw)) {
        if (!key || canonicalKeys.has(headerKey(key))) continue
        row[key] = value
        if (!seenExtras.has(key)) {
          seenExtras.add(key)
          extraHeaders.push(key)
        }
      }
      rows.push(row)
    }
  }

  return Response.json({
    snapshot: {
      id: snapshot.id,
      module: snapshot.module,
      reporting_period: snapshot.reporting_period,
      export_date: snapshot.export_date,
      download_basis: snapshot.download_basis,
      record_count: snapshot.record_count,
      created_at: snapshot.created_at,
      original_filename: snapshot.original_filename,
      uploaded_at: snapshot.uploaded_at,
    },
    headers: [...canonical, ...extraHeaders],
    rows,
  })
}
