interface Env {
  DB: D1Database
}

interface UploadRow {
  id: string
  module: string
  original_filename: string
  checksum_sha256: string
  size_bytes: number
  reporting_period: string
  export_date: string | null
  uploaded_at: string
  status: string
  validation_summary_json: string
  snapshot_id: string | null
  record_count: number | null
  download_basis: string | null
  snapshot_created_at: string | null
  school_id: string | null
  school_name: string | null
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

function parseValidation(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const module = url.searchParams.get("module")
  const status = url.searchParams.get("status")
  const limitValue = Number(url.searchParams.get("limit") ?? "200")
  const limit = Number.isFinite(limitValue)
    ? Math.min(Math.max(Math.trunc(limitValue), 1), 500)
    : 200

  if (module && module !== "school" && module !== "member") {
    return jsonError("module must be either school or member")
  }

  const clauses: string[] = []
  const bindings: unknown[] = []

  if (module) {
    clauses.push("u.module = ?")
    bindings.push(module)
  }
  if (status) {
    clauses.push("u.status = ?")
    bindings.push(status)
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  bindings.push(limit)

  const result = await env.DB.prepare(
    `SELECT u.id, u.module, u.original_filename, u.checksum_sha256, u.size_bytes,
            u.reporting_period, u.export_date, u.uploaded_at, u.status, u.validation_summary_json,
            u.school_id, sc.school_name,
            s.id AS snapshot_id, s.record_count, s.download_basis, s.created_at AS snapshot_created_at
     FROM uploads u
     LEFT JOIN snapshots s ON s.upload_id = u.id
     LEFT JOIN schools sc ON sc.school_id = u.school_id
     ${where}
     ORDER BY u.uploaded_at DESC
     LIMIT ?`,
  )
    .bind(...bindings)
    .all<UploadRow>()

  const uploads = (result.results ?? []).map((row) => ({
    id: row.id,
    module: row.module,
    originalFilename: row.original_filename,
    checksum: row.checksum_sha256,
    sizeBytes: row.size_bytes,
    reportingPeriod: row.reporting_period,
    exportDate: row.export_date,
    uploadedAt: row.uploaded_at,
    status: row.status,
    schoolId: row.school_id,
    schoolName: row.school_name,
    validation: parseValidation(row.validation_summary_json),
    snapshot: row.snapshot_id
      ? {
          id: row.snapshot_id,
          recordCount: Number(row.record_count ?? 0),
          downloadBasis: row.download_basis,
          createdAt: row.snapshot_created_at,
        }
      : null,
  }))

  return Response.json({
    count: uploads.length,
    uploads,
  })
}
