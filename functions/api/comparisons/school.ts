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

interface SchoolRecord {
  school_id: string
  school_name: string | null
  downloads: number | null
}

type Category = "increased" | "decreased" | "no_change" | "new" | "missing" | "invalid"

interface SchoolComparisonResult {
  schoolId: string
  schoolName: string | null
  previousDownloads: number | null
  currentDownloads: number | null
  difference: number | null
  percentageChange: number | null
  category: Category
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
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
                WHERE s.module = 'school'`

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

async function getSchoolRecords(db: D1Database, snapshotId: string): Promise<SchoolRecord[]> {
  const result = await db
    .prepare(
      `SELECT school_id, school_name, downloads
       FROM school_snapshot_records
       WHERE snapshot_id = ?
       ORDER BY school_id`,
    )
    .bind(snapshotId)
    .all<SchoolRecord>()

  return result.results ?? []
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function buildResults(
  previousRecords: SchoolRecord[],
  currentRecords: SchoolRecord[],
): SchoolComparisonResult[] {
  const previousById = new Map(previousRecords.map((record) => [record.school_id, record]))
  const currentById = new Map(currentRecords.map((record) => [record.school_id, record]))
  const results: SchoolComparisonResult[] = []

  for (const current of currentRecords) {
    const previous = previousById.get(current.school_id)
    if (!previous) {
      results.push({
        schoolId: current.school_id,
        schoolName: current.school_name,
        previousDownloads: null,
        currentDownloads: current.downloads,
        difference: null,
        percentageChange: null,
        category: "new",
      })
      continue
    }

    const previousDownloads = previous.downloads
    const currentDownloads = current.downloads
    let difference: number | null = null
    let percentageChange: number | null = null
    let category: Category = "invalid"

    if (previousDownloads !== null && currentDownloads !== null) {
      difference = currentDownloads - previousDownloads
      percentageChange = previousDownloads !== 0 ? (difference / previousDownloads) * 100 : null
      category = difference > 0 ? "increased" : difference < 0 ? "decreased" : "no_change"
    }

    results.push({
      schoolId: current.school_id,
      schoolName: current.school_name ?? previous.school_name,
      previousDownloads,
      currentDownloads,
      difference,
      percentageChange,
      category,
    })
  }

  for (const previous of previousRecords) {
    if (currentById.has(previous.school_id)) continue
    results.push({
      schoolId: previous.school_id,
      schoolName: previous.school_name,
      previousDownloads: previous.downloads,
      currentDownloads: null,
      difference: null,
      percentageChange: null,
      category: "missing",
    })
  }

  return results
}

async function loadExistingComparison(
  db: D1Database,
  previousSnapshotId: string,
  currentSnapshotId: string,
): Promise<{ id: string; results: SchoolComparisonResult[] } | null> {
  const comparison = await db
    .prepare(
      `SELECT id FROM comparisons
       WHERE module = 'school' AND previous_snapshot_id = ? AND current_snapshot_id = ?`,
    )
    .bind(previousSnapshotId, currentSnapshotId)
    .first<{ id: string }>()

  if (!comparison) return null

  const stored = await db
    .prepare(
      `SELECT school_id, school_name, previous_downloads, current_downloads, difference,
              percentage_change, category
       FROM school_comparison_results
       WHERE comparison_id = ?
       ORDER BY school_id`,
    )
    .bind(comparison.id)
    .all<{
      school_id: string
      school_name: string | null
      previous_downloads: number | null
      current_downloads: number | null
      difference: number | null
      percentage_change: number | null
      category: Category
    }>()

  return {
    id: comparison.id,
    results: (stored.results ?? []).map((row) => ({
      schoolId: row.school_id,
      schoolName: row.school_name,
      previousDownloads: row.previous_downloads,
      currentDownloads: row.current_downloads,
      difference: row.difference,
      percentageChange: row.percentage_change,
      category: row.category,
    })),
  }
}

function summarize(results: SchoolComparisonResult[], previousRecords: SchoolRecord[], currentRecords: SchoolRecord[]) {
  const sum = (records: SchoolRecord[]) =>
    records.reduce((total, record) => total + (record.downloads ?? 0), 0)

  return {
    totalSchools: currentRecords.length,
    previousSchools: previousRecords.length,
    totalDownloads: sum(currentRecords),
    previousDownloads: sum(previousRecords),
    increased: results.filter((result) => result.category === "increased").length,
    decreased: results.filter((result) => result.category === "decreased").length,
    noChange: results.filter((result) => result.category === "no_change").length,
    newSchools: results.filter((result) => result.category === "new").length,
    missingSchools: results.filter((result) => result.category === "missing").length,
    invalid: results.filter((result) => result.category === "invalid").length,
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
    return jsonError("No school snapshot found. Upload a school export first.", 404)
  }
  if (currentSnapshot.module !== "school") {
    return jsonError("The selected current snapshot is not a school snapshot.", 400)
  }

  const previousSnapshot = body.previousSnapshotId
    ? await getSnapshot(env.DB, body.previousSnapshotId)
    : await getLatestSnapshot(env.DB, {
        reportingPeriod: currentSnapshot.reporting_period,
        createdAt: currentSnapshot.created_at,
      })

  if (!previousSnapshot) {
    return jsonError("At least two school snapshots are required for a comparison.", 400)
  }
  if (previousSnapshot.module !== "school") {
    return jsonError("The selected previous snapshot is not a school snapshot.", 400)
  }
  if (previousSnapshot.id === currentSnapshot.id) {
    return jsonError("Choose two different snapshots to compare.", 400)
  }

  const existing = await loadExistingComparison(env.DB, previousSnapshot.id, currentSnapshot.id)
  if (existing) {
    const previousRecords = await getSchoolRecords(env.DB, previousSnapshot.id)
    const currentRecords = await getSchoolRecords(env.DB, currentSnapshot.id)
    return Response.json({
      comparison: {
        id: existing.id,
        module: "school",
        previousSnapshot,
        currentSnapshot,
        summary: summarize(existing.results, previousRecords, currentRecords),
        reused: true,
      },
      results: existing.results,
    })
  }

  const previousRecords = await getSchoolRecords(env.DB, previousSnapshot.id)
  const currentRecords = await getSchoolRecords(env.DB, currentSnapshot.id)
  const results = buildResults(previousRecords, currentRecords)
  const comparisonId = crypto.randomUUID()

  const comparisonStatement = env.DB.prepare(
    `INSERT INTO comparisons (id, module, previous_snapshot_id, current_snapshot_id, status)
     VALUES (?, 'school', ?, ?, 'completed')`,
  ).bind(comparisonId, previousSnapshot.id, currentSnapshot.id)

  const resultStatements = results.map((result) =>
    env.DB.prepare(
      `INSERT INTO school_comparison_results
        (id, comparison_id, school_id, school_name, previous_downloads, current_downloads,
         difference, percentage_change, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      comparisonId,
      result.schoolId,
      result.schoolName,
      result.previousDownloads,
      result.currentDownloads,
      result.difference,
      result.percentageChange,
      result.category,
    ),
  )

  try {
    await env.DB.batch([comparisonStatement])
    for (const records of chunk(resultStatements, 250)) {
      await env.DB.batch(records)
    }
  } catch {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM school_comparison_results WHERE comparison_id = ?").bind(comparisonId),
      env.DB.prepare("DELETE FROM comparisons WHERE id = ?").bind(comparisonId),
    ]).catch(() => undefined)

    return jsonError("Unable to save the comparison.", 500)
  }

  return Response.json({
    comparison: {
      id: comparisonId,
      module: "school",
      previousSnapshot,
      currentSnapshot,
      summary: summarize(results, previousRecords, currentRecords),
      reused: false,
    },
    results,
  })
}
