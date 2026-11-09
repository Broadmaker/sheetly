interface Env {
  DB: D1Database
}

interface LatestMemberRow {
  member_id: string
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  full_name_normalized: string | null
  gender: string | null
  account_status: string | null
  email: string | null
  email_normalized: string | null
  portal_role: string | null
  total_downloads: number | null
  registered_at: string | null
  school_name: string | null
  district_name: string | null
  snapshot_id: string
  reporting_period: string
  export_date: string | null
}

function displayName(record: LatestMemberRow): string | null {
  const name = [record.last_name, record.first_name, record.middle_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ")
  return name || null
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
}

const BASE_SELECT = `
  WITH latest AS (
    SELECT r.member_id, r.last_name, r.first_name, r.middle_name, r.full_name_normalized,
           r.gender, r.account_status, r.email, r.email_normalized, r.portal_role,
           r.total_downloads, r.registered_at, r.school_name, r.district_name,
           s.id AS snapshot_id, s.reporting_period, s.export_date,
           ROW_NUMBER() OVER (
             PARTITION BY r.member_id
             ORDER BY s.reporting_period DESC, s.created_at DESC
           ) AS rn
    FROM member_snapshot_records r
    JOIN snapshots s ON s.id = r.snapshot_id
    WHERE s.module = 'member'
  )
  SELECT member_id, last_name, first_name, middle_name, full_name_normalized, gender,
         account_status, email, email_normalized, portal_role, total_downloads, registered_at,
         school_name, district_name, snapshot_id, reporting_period, export_date
  FROM latest
  WHERE rn = 1`

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const query = (url.searchParams.get("q") ?? "").trim()
  const limitValue = Number(url.searchParams.get("limit") ?? "50")
  const limit = Number.isFinite(limitValue)
    ? Math.min(Math.max(Math.trunc(limitValue), 1), 100)
    : 50

  const statement = query
    ? env.DB.prepare(
        `${BASE_SELECT}
         AND (
           lower(member_id) LIKE ? ESCAPE '\\' OR
           full_name_normalized LIKE ? ESCAPE '\\' OR
           lower(email_normalized) LIKE ? ESCAPE '\\' OR
           lower(first_name) LIKE ? ESCAPE '\\' OR
           lower(last_name) LIKE ? ESCAPE '\\' OR
           lower(middle_name) LIKE ? ESCAPE '\\'
         )
         ORDER BY full_name_normalized, member_id
         LIMIT ?`,
      ).bind(
        likePattern(query.toLowerCase()),
        likePattern(query.toLowerCase()),
        likePattern(query.toLowerCase()),
        likePattern(query.toLowerCase()),
        likePattern(query.toLowerCase()),
        likePattern(query.toLowerCase()),
        limit,
      )
    : env.DB.prepare(
        `${BASE_SELECT}
         ORDER BY full_name_normalized, member_id
         LIMIT ?`,
      ).bind(limit)

  const result = await statement.all<LatestMemberRow>()
  const results = (result.results ?? []).map((record) => ({
    memberId: record.member_id,
    fullName: displayName(record),
    email: record.email,
    accountStatus: record.account_status,
    portalRole: record.portal_role,
    totalDownloads: record.total_downloads,
    registeredAt: record.registered_at,
    reportingPeriod: record.reporting_period,
    exportDate: record.export_date,
    snapshotId: record.snapshot_id,
    schoolName: record.school_name,
    districtName: record.district_name,
  }))

  return Response.json({
    query,
    count: results.length,
    hasMore: results.length === limit,
    results,
  })
}
