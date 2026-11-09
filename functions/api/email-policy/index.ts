import {
  bumpPolicyVersion,
  getPolicyVersion,
  isValidDomain,
  normalizeDomain,
} from "../_lib/email-policy"

interface Env {
  DB: D1Database
}

interface DomainRow {
  id: string
  domain: string
  active: number
  policy_version: number
  created_at: string
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

async function listDomains(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT id, domain, active, policy_version, created_at
       FROM email_policies
       ORDER BY active DESC, domain`,
    )
    .all<DomainRow>()

  return (result.results ?? []).map((row) => ({
    id: row.id,
    domain: row.domain,
    active: Boolean(row.active),
    policyVersion: row.policy_version,
    createdAt: row.created_at,
  }))
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [version, domains] = await Promise.all([
    getPolicyVersion(env.DB),
    listDomains(env.DB),
  ])

  return Response.json({ version, domains })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { domain?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const domain = normalizeDomain(String(body.domain ?? ""))
  if (!domain) return jsonError("domain is required")
  if (!isValidDomain(domain)) return jsonError("Enter a valid domain such as deped.gov.ph")

  const existing = await env.DB.prepare("SELECT id FROM email_policies WHERE domain = ?")
    .bind(domain)
    .first<{ id: string }>()
  if (existing) return jsonError("That domain is already in the policy", 409)

  const version = await bumpPolicyVersion(env.DB)
  const id = crypto.randomUUID()

  await env.DB.prepare(
    `INSERT INTO email_policies (id, domain, active, policy_version)
     VALUES (?, ?, 1, ?)`,
  )
    .bind(id, domain, version)
    .run()

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, after_json)
     VALUES (?, 'email_policy.add', 'email_policy', ?, ?)`,
  )
    .bind(crypto.randomUUID(), id, JSON.stringify({ domain, version }))
    .run()
    .catch(() => undefined)

  return Response.json({ version, domains: await listDomains(env.DB) }, { status: 201 })
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let body: { id?: string; active?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const id = String(body.id ?? "").trim()
  if (!id) return jsonError("id is required")
  if (typeof body.active !== "boolean") return jsonError("active must be true or false")

  const existing = await env.DB.prepare("SELECT id, domain, active FROM email_policies WHERE id = ?")
    .bind(id)
    .first<{ id: string; domain: string; active: number }>()
  if (!existing) return jsonError("Domain not found", 404)

  const version = await bumpPolicyVersion(env.DB)

  await env.DB.prepare("UPDATE email_policies SET active = ?, policy_version = ? WHERE id = ?")
    .bind(body.active ? 1 : 0, version, id)
    .run()

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, before_json, after_json)
     VALUES (?, 'email_policy.update', 'email_policy', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      id,
      JSON.stringify({ domain: existing.domain, active: Boolean(existing.active) }),
      JSON.stringify({ domain: existing.domain, active: body.active, version }),
    )
    .run()
    .catch(() => undefined)

  return Response.json({ version, domains: await listDomains(env.DB) })
}
