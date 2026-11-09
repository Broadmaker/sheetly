export type EmailClassification =
  | "deped_domain"
  | "non_deped_domain"
  | "invalid_missing"
  | "needs_verification"

export interface EmailPolicyEnv {
  DB: D1Database
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const POLICY_VERSION_KEY = "email_policy_version"

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "")
}

export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

export function classifyEmail(
  email: string | null | undefined,
  approvedDomains: string[],
): { classification: EmailClassification; domain: string | null } {
  const normalized = normalizeEmail(email)
  if (!normalized || !EMAIL_PATTERN.test(normalized)) {
    return { classification: "invalid_missing", domain: null }
  }

  const domain = normalized.split("@").pop() ?? null
  if (!domain) return { classification: "invalid_missing", domain: null }

  if (!approvedDomains.length) {
    return { classification: "needs_verification", domain }
  }

  const matches = approvedDomains.some(
    (approved) => domain === approved || domain.endsWith(`.${approved}`),
  )

  return { classification: matches ? "deped_domain" : "non_deped_domain", domain }
}

export async function getPolicyVersion(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT value_json FROM settings WHERE key = ?")
    .bind(POLICY_VERSION_KEY)
    .first<{ value_json: string }>()

  if (!row) return 1
  try {
    const value = Number(JSON.parse(row.value_json))
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1
  } catch {
    return 1
  }
}

export async function bumpPolicyVersion(db: D1Database): Promise<number> {
  const current = await getPolicyVersion(db)
  const next = current + 1
  await db
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    )
    .bind(POLICY_VERSION_KEY, JSON.stringify(next))
    .run()
  return next
}

export async function getActiveDomains(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare("SELECT domain FROM email_policies WHERE active = 1 ORDER BY domain")
    .all<{ domain: string }>()
  return (result.results ?? []).map((row) => normalizeDomain(row.domain)).filter(Boolean)
}
