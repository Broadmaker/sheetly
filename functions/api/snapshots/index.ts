interface Env {
  DB: D1Database
}

interface SnapshotRow {
  id: string
  module: string
  reporting_period: string
  export_date: string | null
  download_basis: string
  record_count: number
  created_at: string
  original_filename: string
  checksum_sha256: string
  size_bytes: number
  status: string
  uploaded_at: string
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const module = url.searchParams.get("module")
  const limitValue = Number(url.searchParams.get("limit") ?? "50")
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.trunc(limitValue), 1), 200) : 50

  if (module && module !== "school" && module !== "member") {
    return Response.json({ error: "module must be either school or member" }, { status: 400 })
  }

  const columns = `s.id, s.module, s.reporting_period, s.export_date, s.download_basis,
    s.record_count, s.created_at, u.original_filename, u.checksum_sha256, u.size_bytes,
    u.status, u.uploaded_at`

  const statement = module
    ? env.DB.prepare(
        `SELECT ${columns}
         FROM snapshots s
         JOIN uploads u ON u.id = s.upload_id
         WHERE s.module = ?
         ORDER BY s.reporting_period DESC, s.created_at DESC
         LIMIT ?`,
      ).bind(module, limit)
    : env.DB.prepare(
        `SELECT ${columns}
         FROM snapshots s
         JOIN uploads u ON u.id = s.upload_id
         ORDER BY s.reporting_period DESC, s.created_at DESC
         LIMIT ?`,
      ).bind(limit)

  const result = await statement.all<SnapshotRow>()

  return Response.json({
    snapshots: result.results ?? [],
  })
}
