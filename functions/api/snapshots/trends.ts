interface Env {
  DB: D1Database
}

interface TrendRow {
  id: string
  reporting_period: string
  export_date: string | null
  record_count: number
  created_at: string
  total_registered: number | null
  total_actual: number | null
  total_downloads: number | null
  active_schools: number | null
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const module = url.searchParams.get("module") ?? "school"

  if (module !== "school") {
    return Response.json({ error: "module must be school" }, { status: 400 })
  }

  const result = await env.DB.prepare(
    `SELECT s.id, s.reporting_period, s.export_date, s.record_count, s.created_at,
            COALESCE(SUM(r.registered_users), 0) AS total_registered,
            COALESCE(SUM(r.actual_users), 0) AS total_actual,
            COALESCE(SUM(r.downloads), 0) AS total_downloads,
            COALESCE(SUM(CASE WHEN r.downloads > 0 THEN 1 ELSE 0 END), 0) AS active_schools
     FROM snapshots s
     LEFT JOIN school_snapshot_records r ON r.snapshot_id = s.id
     WHERE s.module = 'school'
     GROUP BY s.id
     ORDER BY s.reporting_period ASC, s.created_at ASC`,
  ).all<TrendRow>()

  const byMonth = new Map<string, TrendRow>()
  for (const row of result.results ?? []) {
    byMonth.set(row.reporting_period.slice(0, 7), row)
  }

  const trends = [...byMonth.entries()].map(([period, row]) => {
    const totalRegistered = Number(row.total_registered ?? 0)
    const totalActual = Number(row.total_actual ?? 0)
    return {
      id: row.id,
      period,
      exportDate: row.export_date,
      recordCount: Number(row.record_count ?? 0),
      createdAt: row.created_at,
      totalRegistered,
      totalActual,
      totalDownloads: Number(row.total_downloads ?? 0),
      activeSchools: Number(row.active_schools ?? 0),
      participationRate: totalRegistered ? (totalActual / totalRegistered) * 100 : 0,
    }
  })

  return Response.json({ trends })
}
