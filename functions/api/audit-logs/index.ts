interface Env {
  DB: D1Database
}

interface AuditRow {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before_json: string | null
  after_json: string | null
  note: string | null
  created_at: string
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const action = (url.searchParams.get("action") ?? "").trim()
  const entityType = (url.searchParams.get("entityType") ?? "").trim()
  const limitValue = Number(url.searchParams.get("limit") ?? "200")
  const limit = Number.isFinite(limitValue)
    ? Math.min(Math.max(Math.trunc(limitValue), 1), 500)
    : 200

  const clauses: string[] = []
  const bindings: unknown[] = []

  if (action) {
    clauses.push("action LIKE ? ESCAPE '\\'")
    bindings.push(`${action.replace(/[\\%_]/g, (match) => `\\${match}`)}%`)
  }
  if (entityType) {
    clauses.push("entity_type = ?")
    bindings.push(entityType)
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  bindings.push(limit)

  const result = await env.DB.prepare(
    `SELECT id, user_id, action, entity_type, entity_id, before_json, after_json, note, created_at
     FROM audit_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(...bindings)
    .all<AuditRow>()

  return Response.json({
    count: result.results?.length ?? 0,
    logs: (result.results ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: parseJson(row.before_json),
      after: parseJson(row.after_json),
      note: row.note,
      createdAt: row.created_at,
    })),
  })
}
