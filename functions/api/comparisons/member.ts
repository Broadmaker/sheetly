interface Env {
  DB: D1Database
}

interface SnapshotMeta {
  id: string
  module: string
  reporting_period: string
  export_date: string | null
  record_count: number
  created_at: string
  original_filename: string
}

interface MemberRecord {
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

type Category = "new" | "existing" | "missing" | "updated_profile" | "status_changed" | "invalid"

type ChangedFields = Record<string, { previous: string | null; current: string | null }>

interface MemberComparisonResult {
  memberId: string
  fullName: string | null
  email: string | null
  category: Category
  previousDownloads: number | null
  currentDownloads: number | null
  difference: number | null
  percentageChange: number | null
  changedFields: ChangedFields
}

type ProfileField =
  | "last_name"
  | "first_name"
  | "middle_name"
  | "gender"
  | "email"
  | "portal_role"
  | "school_id"
  | "school_name"
  | "district_id"
  | "district_name"

const PROFILE_FIELDS: Array<[ProfileField, string]> = [
  ["last_name", "Last name"],
  ["first_name", "First name"],
  ["middle_name", "Middle name"],
  ["gender", "Gender"],
  ["email", "Email"],
  ["portal_role", "Portal role"],
  ["school_id", "School ID"],
  ["school_name", "School name"],
  ["district_id", "District ID"],
  ["district_name", "District name"],
]

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

function clean(value: string | null): string | null {
  if (value == null) return null
  const normalized = value.trim().replace(/\s+/g, " ")
  return normalized || null
}

function normalize(value: string | null): string {
  return (clean(value) ?? "").toLowerCase()
}

function displayName(record: MemberRecord): string | null {
  const name = [record.last_name, record.first_name, record.middle_name]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(", ")
  return name || null
}

async function getSnapshot(db: D1Database, id: string): Promise<SnapshotMeta | null> {
  return db
    .prepare(
      `SELECT s.id, s.module, s.reporting_period, s.export_date, s.record_count, s.created_at,
              u.original_filename
       FROM snapshots s
       JOIN uploads u ON u.id = s.upload_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<SnapshotMeta>()
}

async function getLatestSnapshot(
  db: D1Database,
  before?: { reportingPeriod: string; createdAt: string },
): Promise<SnapshotMeta | null> {
  const base = `SELECT s.id, s.module, s.reporting_period, s.export_date, s.record_count, s.created_at,
                       u.original_filename
                FROM snapshots s
                JOIN uploads u ON u.id = s.upload_id
                WHERE s.module = 'member'`

  if (before) {
    return db
      .prepare(
        `${base}
         AND (s.reporting_period < ? OR (s.reporting_period = ? AND s.created_at < ?))
         ORDER BY s.reporting_period DESC, s.created_at DESC
         LIMIT 1`,
      )
      .bind(before.reportingPeriod, before.reportingPeriod, before.createdAt)
      .first<SnapshotMeta>()
  }

  return db
    .prepare(`${base} ORDER BY s.reporting_period DESC, s.created_at DESC LIMIT 1`)
    .first<SnapshotMeta>()
}

async function getMemberRecords(db: D1Database, snapshotId: string): Promise<MemberRecord[]> {
  const result = await db
    .prepare(
      `SELECT member_id, last_name, first_name, middle_name, gender, account_status, email,
              portal_role, total_downloads, registered_at, school_id, school_name, district_id,
              district_name
       FROM member_snapshot_records
       WHERE snapshot_id = ?
       ORDER BY member_id`,
    )
    .bind(snapshotId)
    .all<MemberRecord>()

  return result.results ?? []
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function buildChangedFields(previous: MemberRecord, current: MemberRecord): { changed: ChangedFields; statusChanged: boolean } {
  const changed: ChangedFields = {}
  for (const [key, label] of PROFILE_FIELDS) {
    if (normalize(previous[key]) !== normalize(current[key])) {
      changed[label] = { previous: clean(previous[key]), current: clean(current[key]) }
    }
  }

  const statusChanged = normalize(previous.account_status) !== normalize(current.account_status)
  if (statusChanged) {
    changed["Account status"] = {
      previous: clean(previous.account_status),
      current: clean(current.account_status),
    }
  }

  return { changed, statusChanged }
}

function classify(
  previous: MemberRecord | undefined,
  current: MemberRecord,
): MemberComparisonResult {
  const currentDownloads = current.total_downloads
  const fullName = displayName(current)
  const email = clean(current.email)

  if (!previous) {
    return {
      memberId: current.member_id,
      fullName,
      email,
      category: "new",
      previousDownloads: null,
      currentDownloads,
      difference: null,
      percentageChange: null,
      changedFields: {},
    }
  }

  const { changed, statusChanged } = buildChangedFields(previous, current)
  const category: Category = statusChanged
    ? "status_changed"
    : Object.keys(changed).length
      ? "updated_profile"
      : "existing"

  const previousDownloads = previous.total_downloads
  const difference =
    previousDownloads !== null && currentDownloads !== null
      ? currentDownloads - previousDownloads
      : null
  const percentageChange =
    difference !== null && previousDownloads
      ? (difference / previousDownloads) * 100
      : null

  return {
    memberId: current.member_id,
    fullName,
    email,
    category,
    previousDownloads,
    currentDownloads,
    difference,
    percentageChange,
    changedFields: changed,
  }
}

function buildResults(previousRecords: MemberRecord[], currentRecords: MemberRecord[]): MemberComparisonResult[] {
  const previousById = new Map(previousRecords.map((record) => [record.member_id, record]))
  const currentById = new Map(currentRecords.map((record) => [record.member_id, record]))
  const results: MemberComparisonResult[] = []

  for (const current of currentRecords) {
    results.push(classify(previousById.get(current.member_id), current))
  }

  for (const previous of previousRecords) {
    if (currentById.has(previous.member_id)) continue
    results.push({
      memberId: previous.member_id,
      fullName: displayName(previous),
      email: clean(previous.email),
      category: "missing",
      previousDownloads: previous.total_downloads,
      currentDownloads: null,
      difference: null,
      percentageChange: null,
      changedFields: {},
    })
  }

  return results
}

function summarize(results: MemberComparisonResult[], previousRecords: MemberRecord[], currentRecords: MemberRecord[]) {
  const sum = (records: MemberRecord[]) =>
    records.reduce((total, record) => total + (record.total_downloads ?? 0), 0)
  const matched = results.filter((result) =>
    ["existing", "updated_profile", "status_changed"].includes(result.category),
  )

  return {
    totalMembers: currentRecords.length,
    previousMembers: previousRecords.length,
    totalDownloads: sum(currentRecords),
    previousDownloads: sum(previousRecords),
    newMembers: results.filter((result) => result.category === "new").length,
    existingMembers: matched.length,
    missingMembers: results.filter((result) => result.category === "missing").length,
    updatedProfiles: results.filter((result) => result.category === "updated_profile").length,
    statusChanged: results.filter((result) => result.category === "status_changed").length,
    invalid: results.filter((result) => result.category === "invalid").length,
    increasedDownloads: results.filter((result) => result.difference !== null && result.difference > 0).length,
    decreasedDownloads: results.filter((result) => result.difference !== null && result.difference < 0).length,
    noChangeDownloads: results.filter((result) => result.difference === 0).length,
    zeroDownloads: currentRecords.filter((record) => (record.total_downloads ?? 0) === 0).length,
  }
}

async function loadExistingComparison(
  db: D1Database,
  previousSnapshotId: string,
  currentSnapshotId: string,
): Promise<{ id: string; results: MemberComparisonResult[] } | null> {
  const comparison = await db
    .prepare(
      `SELECT id FROM comparisons
       WHERE module = 'member' AND previous_snapshot_id = ? AND current_snapshot_id = ?`,
    )
    .bind(previousSnapshotId, currentSnapshotId)
    .first<{ id: string }>()

  if (!comparison) return null

  const stored = await db
    .prepare(
      `SELECT member_id, category, previous_total_downloads, current_total_downloads,
              difference, changed_fields_json
       FROM member_comparison_results
       WHERE comparison_id = ?
       ORDER BY member_id`,
    )
    .bind(comparison.id)
    .all<{
      member_id: string
      category: Category
      previous_total_downloads: number | null
      current_total_downloads: number | null
      difference: number | null
      changed_fields_json: string
    }>()

  return {
    id: comparison.id,
    results: (stored.results ?? []).map((row) => {
      let changedFields: ChangedFields = {}
      try {
        changedFields = JSON.parse(row.changed_fields_json || "{}") as ChangedFields
      } catch {
        changedFields = {}
      }
      const percentageChange =
        row.difference !== null && row.previous_total_downloads
          ? (row.difference / row.previous_total_downloads) * 100
          : null
      return {
        memberId: row.member_id,
        fullName: null,
        email: null,
        category: row.category,
        previousDownloads: row.previous_total_downloads,
        currentDownloads: row.current_total_downloads,
        difference: row.difference,
        percentageChange,
        changedFields,
      }
    }),
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { currentSnapshotId?: string; previousSnapshotId?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const currentSnapshot = body.currentSnapshotId
    ? await getSnapshot(env.DB, body.currentSnapshotId)
    : await getLatestSnapshot(env.DB)

  if (!currentSnapshot) {
    return jsonError("No member snapshot found. Upload a member export first.", 404)
  }
  if (currentSnapshot.module !== "member") {
    return jsonError("The selected current snapshot is not a member snapshot.", 400)
  }

  const previousSnapshot = body.previousSnapshotId
    ? await getSnapshot(env.DB, body.previousSnapshotId)
    : await getLatestSnapshot(env.DB, {
        reportingPeriod: currentSnapshot.reporting_period,
        createdAt: currentSnapshot.created_at,
      })

  if (!previousSnapshot) {
    return jsonError("At least two member snapshots are required for a comparison.", 400)
  }
  if (previousSnapshot.module !== "member") {
    return jsonError("The selected previous snapshot is not a member snapshot.", 400)
  }
  if (previousSnapshot.id === currentSnapshot.id) {
    return jsonError("Choose two different snapshots to compare.", 400)
  }

  const previousRecords = await getMemberRecords(env.DB, previousSnapshot.id)
  const currentRecords = await getMemberRecords(env.DB, currentSnapshot.id)

  const existing = await loadExistingComparison(env.DB, previousSnapshot.id, currentSnapshot.id)
  if (existing) {
    const previousById = new Map(previousRecords.map((record) => [record.member_id, record]))
    const currentById = new Map(currentRecords.map((record) => [record.member_id, record]))
    const hydrated = existing.results.map((result) => {
      const record = currentById.get(result.memberId) ?? previousById.get(result.memberId)
      return {
        ...result,
        fullName: record ? displayName(record) : result.fullName,
        email: record ? clean(record.email) : result.email,
      }
    })
    return Response.json({
      comparison: {
        id: existing.id,
        module: "member",
        previousSnapshot,
        currentSnapshot,
        summary: summarize(hydrated, previousRecords, currentRecords),
        reused: true,
      },
      results: hydrated,
    })
  }

  const results = buildResults(previousRecords, currentRecords)
  const comparisonId = crypto.randomUUID()

  const comparisonStatement = env.DB.prepare(
    `INSERT INTO comparisons (id, module, previous_snapshot_id, current_snapshot_id, status)
     VALUES (?, 'member', ?, ?, 'completed')`,
  ).bind(comparisonId, previousSnapshot.id, currentSnapshot.id)

  const resultStatements = results.map((result) =>
    env.DB.prepare(
      `INSERT INTO member_comparison_results
        (id, comparison_id, member_id, category, previous_total_downloads,
         current_total_downloads, difference, changed_fields_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      comparisonId,
      result.memberId,
      result.category,
      result.previousDownloads,
      result.currentDownloads,
      result.difference,
      JSON.stringify(result.changedFields),
    ),
  )

  try {
    await env.DB.batch([comparisonStatement])
    for (const records of chunk(resultStatements, 250)) {
      await env.DB.batch(records)
    }
  } catch {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM member_comparison_results WHERE comparison_id = ?").bind(comparisonId),
      env.DB.prepare("DELETE FROM comparisons WHERE id = ?").bind(comparisonId),
    ]).catch(() => undefined)

    return jsonError("Unable to save the comparison.", 500)
  }

  return Response.json({
    comparison: {
      id: comparisonId,
      module: "member",
      previousSnapshot,
      currentSnapshot,
      summary: summarize(results, previousRecords, currentRecords),
      reused: false,
    },
    results,
  })
}
