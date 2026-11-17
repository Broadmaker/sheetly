interface Env {
  DB: D1Database
}

interface SchoolRow {
  school_id: string
  school_name: string
  is_master: number
  division_id: string | null
  division_name: string | null
  last_seen_period: string | null
  registered_users: number | null
  actual_users: number | null
  participation_rate: number | null
  downloads: number | null
  reported_name: string | null
  previous_registered_users: number | null
  previous_actual_users: number | null
  previous_participation_rate: number | null
  previous_downloads: number | null
  previous_reported_name: string | null
  user_upload_count: number
  latest_roster_period: string | null
  latest_roster_count: number | null
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const periodsResult = await env.DB.prepare(
      `SELECT s.id, s.reporting_period
       FROM snapshots s
       WHERE s.module = 'school'
         AND s.id = (
           SELECT s2.id FROM snapshots s2
           WHERE s2.module = 'school' AND s2.reporting_period = s.reporting_period
           ORDER BY s2.created_at DESC LIMIT 1
         )
       ORDER BY s.reporting_period DESC, s.created_at DESC
       LIMIT 2`,
    ).all<{ id: string; reporting_period: string }>()
    const periods = periodsResult.results ?? []
    const latest = periods[0] ?? null
    const previous = periods[1] ?? null

    const result = await env.DB.prepare(
      `SELECT sc.school_id, sc.school_name, sc.is_master, sc.division_id, sc.last_seen_period,
              d.name AS division_name,
              r.registered_users, r.actual_users, r.participation_rate, r.downloads,
              r.school_name AS reported_name,
              pr.registered_users AS previous_registered_users,
              pr.actual_users AS previous_actual_users,
              pr.participation_rate AS previous_participation_rate,
              pr.downloads AS previous_downloads,
              pr.school_name AS previous_reported_name,
              (SELECT COUNT(*) FROM uploads u
                 WHERE u.module = 'member' AND u.school_id = sc.school_id) AS user_upload_count,
              (SELECT MAX(s2.reporting_period)
                 FROM snapshots s2 JOIN uploads u2 ON u2.id = s2.upload_id
                WHERE s2.module = 'member' AND u2.school_id = sc.school_id) AS latest_roster_period,
              (SELECT s2.record_count
                 FROM snapshots s2 JOIN uploads u2 ON u2.id = s2.upload_id
                WHERE s2.module = 'member' AND u2.school_id = sc.school_id
                ORDER BY s2.reporting_period DESC, s2.created_at DESC
                LIMIT 1) AS latest_roster_count
       FROM schools sc
       LEFT JOIN divisions d ON d.id = sc.division_id
       LEFT JOIN school_snapshot_records r
         ON r.snapshot_id = ? AND r.school_id = sc.school_id
       LEFT JOIN school_snapshot_records pr
         ON pr.snapshot_id = ? AND pr.school_id = sc.school_id
       ORDER BY sc.school_name COLLATE NOCASE, sc.school_id`,
    )
      .bind(latest?.id ?? "", previous?.id ?? "")
      .all<SchoolRow>()

    const rows = result.results ?? []
    const schools = rows.map((row) => ({
      schoolId: row.school_id,
      schoolName: row.school_name,
      divisionId: row.division_id,
      divisionName: row.division_name,
      isMaster: row.is_master === 1,
      lastSeenPeriod: row.last_seen_period,
      inLatestUserCount: row.reported_name != null,
      hasUtilization: row.reported_name != null,
      nameMismatch:
        row.reported_name != null &&
        row.reported_name.trim().toLowerCase() !== row.school_name.trim().toLowerCase(),
      reportedName: row.reported_name,
      registeredUsers: row.registered_users,
      actualUsers: row.actual_users,
      participationRate: row.participation_rate,
      downloads: row.downloads,
      hasPreviousUtilization: row.previous_reported_name != null,
      registeredUsersChange:
        row.registered_users != null && row.previous_registered_users != null
          ? row.registered_users - row.previous_registered_users
          : null,
      actualUsersChange:
        row.actual_users != null && row.previous_actual_users != null
          ? row.actual_users - row.previous_actual_users
          : null,
      participationRateChange:
        row.participation_rate != null && row.previous_participation_rate != null
          ? row.participation_rate - row.previous_participation_rate
          : null,
      downloadsChange:
        row.downloads != null && row.previous_downloads != null
          ? row.downloads - row.previous_downloads
          : null,
      userUploadCount: Number(row.user_upload_count ?? 0),
      latestRosterPeriod: row.latest_roster_period,
      latestRosterCount: row.latest_roster_count,
    }))

    const masterCount = schools.filter((school) => school.isMaster).length
    const extraCount = schools.length - masterCount

    return Response.json({
      latestPeriod: latest?.reporting_period ?? null,
      previousPeriod: previous?.reporting_period ?? null,
      summary: {
        totalSchools: schools.length,
        masterSchools: masterCount,
        extraSchools: extraCount,
        withUtilization: schools.filter((school) => school.hasUtilization).length,
        withoutUtilization: schools.filter((school) => !school.hasUtilization).length,
        withRoster: schools.filter((school) => school.userUploadCount > 0).length,
        withoutRoster: schools.filter((school) => school.userUploadCount === 0).length,
      },
      schools,
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load schools", 500)
  }
}
