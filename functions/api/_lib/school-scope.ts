export interface SchoolInfo {
  school_id: string
  school_name: string
  is_master: number
  division_id: string | null
  last_seen_period: string | null
}

export function parseSchoolIdFromFilename(fileName: string): string | null {
  const match = fileName.match(/deped-school-id-(\d+)/i)
  return match ? match[1] : null
}

export function parsePeriodFromFilename(fileName: string): { period: string; exportDate: string } | null {
  const match = fileName.match(/(20\d{2})(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day] = match
  const monthNumber = Number(month)
  const dayNumber = Number(day)
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null
  return { period: `${year}-${month}`, exportDate: `${year}-${month}-${day}` }
}

export function cleanSchoolId(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

export async function getSchool(db: D1Database, schoolId: string): Promise<SchoolInfo | null> {
  return db
    .prepare(
      `SELECT school_id, school_name, is_master, division_id, last_seen_period
       FROM schools
       WHERE school_id = ?`,
    )
    .bind(schoolId)
    .first<SchoolInfo>()
}

export async function ensureSchool(
  db: D1Database,
  schoolId: string,
  schoolName: string | null,
): Promise<SchoolInfo> {
  const existing = await getSchool(db, schoolId)
  if (existing) return existing

  const name = (schoolName ?? "").trim() || `School ${schoolId}`
  await db
    .prepare(
      `INSERT INTO schools (school_id, school_name, division_id, is_master, updated_at)
       VALUES (?, ?, 'zamboanga-sibugay', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(school_id) DO UPDATE SET
         school_name = CASE WHEN schools.school_name IS NULL OR schools.school_name = '' THEN excluded.school_name ELSE schools.school_name END,
         updated_at = excluded.updated_at`,
    )
    .bind(schoolId, name)
    .run()

  return (
    (await getSchool(db, schoolId)) ?? {
      school_id: schoolId,
      school_name: name,
      is_master: 0,
      division_id: "zamboanga-sibugay",
      last_seen_period: null,
    }
  )
}
