interface Env {
  DB: D1Database
}

interface MemberHistoryRow {
  snapshot_id: string
  reporting_period: string
  export_date: string | null
  download_basis: string
  snapshot_created_at: string
  original_filename: string
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
  school_id: string | null
  school_name: string | null
  district_id: string | null
  district_name: string | null
}

interface DuplicateCaseRow {
  id: string
  member_id_a: string
  member_id_b: string
  reason: string
  confidence: string
  status: string
  note: string | null
  created_at: string
}

interface ChangedField {
  field: string
  label: string
  previous: string | null
  current: string | null
}

const PROFILE_FIELDS: Array<[keyof MemberHistoryRow, string]> = [
  ["last_name", "Last name"],
  ["first_name", "First name"],
  ["middle_name", "Middle name"],
  ["gender", "Gender"],
  ["email", "Email"],
  ["account_status", "Account status"],
  ["portal_role", "Portal role"],
  ["school_id", "School ID"],
  ["school_name", "School name"],
  ["district_id", "District ID"],
  ["district_name", "District name"],
  ["registered_at", "Registered"],
]

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

function clean(value: unknown): string | null {
  if (value == null) return null
  const normalized = String(value).trim().replace(/\s+/g, " ")
  return normalized || null
}

function normalize(value: unknown): string {
  return (clean(value) ?? "").toLowerCase()
}

function displayName(row: MemberHistoryRow): string | null {
  const name = [row.last_name, row.first_name, row.middle_name]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(", ")
  return name || null
}

function buildChanges(previous: MemberHistoryRow, current: MemberHistoryRow): ChangedField[] {
  const changes: ChangedField[] = []
  for (const [field, label] of PROFILE_FIELDS) {
    if (normalize(previous[field]) === normalize(current[field])) continue
    changes.push({
      field: String(field),
      label,
      previous: clean(previous[field]),
      current: clean(current[field]),
    })
  }
  return changes
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const memberId = String(params.id ?? "").trim()
  if (!memberId) return jsonError("Member id is required")

  const result = await env.DB.prepare(
    `SELECT r.snapshot_id, s.reporting_period, s.export_date, s.download_basis,
            s.created_at AS snapshot_created_at, u.original_filename,
            r.member_id, r.last_name, r.first_name, r.middle_name, r.gender,
            r.account_status, r.email, r.portal_role, r.total_downloads, r.registered_at,
            r.school_id, r.school_name, r.district_id, r.district_name
     FROM member_snapshot_records r
     JOIN snapshots s ON s.id = r.snapshot_id
     JOIN uploads u ON u.id = s.upload_id
     WHERE r.member_id = ? AND s.module = 'member'
     ORDER BY s.reporting_period ASC, s.created_at ASC`,
  )
    .bind(memberId)
    .all<MemberHistoryRow>()

  const rows = result.results ?? []
  if (!rows.length) return jsonError("Member not found in any saved snapshot.", 404)

  const history = rows.map((row, index) => {
    const previous = index > 0 ? rows[index - 1] : null
    const previousDownloads = previous?.total_downloads ?? null
    const currentDownloads = row.total_downloads
    const difference =
      previous && previousDownloads !== null && currentDownloads !== null
        ? currentDownloads - previousDownloads
        : null
    const percentageChange =
      difference !== null && previousDownloads
        ? (difference / previousDownloads) * 100
        : null

    return {
      snapshotId: row.snapshot_id,
      reportingPeriod: row.reporting_period,
      exportDate: row.export_date,
      downloadBasis: row.download_basis,
      originalFilename: row.original_filename,
      savedAt: row.snapshot_created_at,
      totalDownloads: currentDownloads,
      previousTotalDownloads: previousDownloads,
      difference,
      percentageChange,
      accountStatus: row.account_status,
      portalRole: row.portal_role,
      email: row.email,
      schoolId: row.school_id,
      schoolName: row.school_name,
      districtId: row.district_id,
      districtName: row.district_name,
      changedFields: previous ? buildChanges(previous, row) : [],
    }
  })

  const latestRow = rows[rows.length - 1]
  const hasAssignmentData = rows.some(
    (row) => clean(row.school_id) || clean(row.school_name) || clean(row.district_id) || clean(row.district_name),
  )

  const duplicateResult = await env.DB.prepare(
    `SELECT id, member_id_a, member_id_b, reason, confidence, status, note, created_at
     FROM duplicate_review_cases
     WHERE member_id_a = ? OR member_id_b = ?
     ORDER BY created_at DESC
     LIMIT 50`,
  )
    .bind(memberId, memberId)
    .all<DuplicateCaseRow>()

  const limitations: string[] = []
  if (!hasAssignmentData) {
    limitations.push(
      "School and district transfer tracking is unavailable because the member export does not include assignment fields.",
    )
  }

  return Response.json({
    member: {
      memberId: latestRow.member_id,
      fullName: displayName(latestRow),
      lastName: latestRow.last_name,
      firstName: latestRow.first_name,
      middleName: latestRow.middle_name,
      gender: latestRow.gender,
      email: latestRow.email,
      accountStatus: latestRow.account_status,
      portalRole: latestRow.portal_role,
      registeredAt: latestRow.registered_at,
      latest: {
        snapshotId: latestRow.snapshot_id,
        reportingPeriod: latestRow.reporting_period,
        exportDate: latestRow.export_date,
        originalFilename: latestRow.original_filename,
        totalDownloads: latestRow.total_downloads,
        schoolId: latestRow.school_id,
        schoolName: latestRow.school_name,
        districtId: latestRow.district_id,
        districtName: latestRow.district_name,
      },
      snapshotsSeen: rows.length,
      history: [...history].reverse(),
      duplicateCases: (duplicateResult.results ?? []).map((row) => ({
        id: row.id,
        otherMemberId: row.member_id_a === memberId ? row.member_id_b : row.member_id_a,
        reason: row.reason,
        confidence: row.confidence,
        status: row.status,
        note: row.note,
        createdAt: row.created_at,
      })),
      limitations,
    },
  })
}
