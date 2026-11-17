import { classifyEmail, getActiveDomains } from "../_lib/email-policy"
import {
  buildComparedMembers,
  buildRosterMembers,
  summarizeMembers,
  type MemberEmailType,
  type MemberRecord,
} from "../_lib/member-compare"

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
}

interface UtilizationRow {
  reporting_period: string
  report_date: string
  registered_users: number | null
  actual_users: number | null
  participation_rate: number | null
  downloads: number | null
  reported_name: string | null
}

interface SnapshotRow {
  id: string
  reporting_period: string
  record_count: number
  created_at: string
  download_basis: string
  original_filename: string
  school_id: string | null
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const schoolId = String(params.id ?? "").trim()
  if (!schoolId) return jsonError("School id is required")

  try {
    const school = await env.DB.prepare(
      `SELECT sc.school_id, sc.school_name, sc.is_master, sc.division_id, sc.last_seen_period,
              d.name AS division_name
       FROM schools sc
       LEFT JOIN divisions d ON d.id = sc.division_id
       WHERE sc.school_id = ?`,
    )
      .bind(schoolId)
      .first<SchoolRow>()

    if (!school) return jsonError("School not found in the master list.", 404)

    const utilizationResult = await env.DB.prepare(
      `SELECT s.reporting_period, s.created_at AS report_date,
              r.registered_users, r.actual_users, r.participation_rate, r.downloads,
              r.school_name AS reported_name
       FROM school_snapshot_records r
       JOIN snapshots s ON s.id = r.snapshot_id
       WHERE r.school_id = ? AND s.module = 'school'
         AND s.id = (
           SELECT s2.id FROM snapshots s2
           WHERE s2.module = 'school' AND s2.reporting_period = s.reporting_period
           ORDER BY s2.created_at DESC LIMIT 1
         )
       ORDER BY s.reporting_period DESC, s.created_at DESC
       LIMIT 2`,
    )
      .bind(schoolId)
      .all<UtilizationRow>()
    const utilizationRows = utilizationResult.results ?? []
    const utilization = utilizationRows[0] ?? null
    const previousUtilization = utilizationRows[1] ?? null

    const rosterResult = await env.DB.prepare(
      `SELECT s.id, s.reporting_period, s.record_count, s.created_at, s.download_basis,
              u.original_filename, u.school_id
       FROM snapshots s
       JOIN uploads u ON u.id = s.upload_id
       WHERE s.module = 'member'
         AND (
           u.school_id = ? OR
           EXISTS (
             SELECT 1 FROM member_snapshot_records r
             WHERE r.snapshot_id = s.id AND r.school_id = ?
           )
         )
       ORDER BY s.reporting_period DESC, s.created_at DESC`,
    )
      .bind(schoolId, schoolId)
      .all<SnapshotRow>()

    const rosterPeriods = (rosterResult.results ?? []).map((row) => ({
      snapshotId: row.id,
      period: row.reporting_period,
      recordCount: Number(row.record_count ?? 0),
      uploadedAt: row.created_at,
      downloadBasis: row.download_basis,
      filename: row.original_filename,
    }))

    const current = rosterPeriods[0] ?? null
    const previous = rosterPeriods[1] ?? null

    function loadRecords(snapshotId: string): Promise<MemberRecord[]> {
      return env.DB.prepare(
        `SELECT member_id, last_name, first_name, middle_name, gender, account_status, email,
                portal_role, total_downloads, registered_at, school_id, school_name
         FROM member_snapshot_records
         WHERE snapshot_id = ? AND (school_id = ? OR school_id IS NULL)
         ORDER BY member_id`,
      )
        .bind(snapshotId, schoolId)
        .all<MemberRecord>()
        .then((result) => result.results ?? [])
    }

    const currentRecords = current ? await loadRecords(current.snapshotId) : []
    const previousRecords = previous ? await loadRecords(previous.snapshotId) : []

    const domains = await getActiveDomains(env.DB)
    const approvedDomains = domains.length ? domains : ["deped.gov.ph"]
    const emailTypeOf = (email: string | null): MemberEmailType => {
      const { classification } = classifyEmail(email, approvedDomains)
      if (classification === "deped_domain") return "deped"
      if (classification === "non_deped_domain") return "non_deped"
      return "invalid_missing"
    }

    const compared = buildComparedMembers(previousRecords, currentRecords)
    const users = compared.map((member) => ({
      ...member,
      emailType: emailTypeOf(member.email),
    }))
    const previousUsers = buildRosterMembers(previousRecords).map((member) => ({
      ...member,
      emailType: emailTypeOf(member.email),
    }))
    const summary = summarizeMembers(compared, emailTypeOf)

    return Response.json({
      school: {
        schoolId: school.school_id,
        schoolName: school.school_name,
        divisionId: school.division_id,
        divisionName: school.division_name,
        isMaster: school.is_master === 1,
        lastSeenPeriod: school.last_seen_period,
        reportedName: utilization?.reported_name ?? null,
        nameMismatch:
          utilization?.reported_name != null &&
          utilization.reported_name.trim().toLowerCase() !== school.school_name.trim().toLowerCase(),
      },
      utilization: utilization
        ? {
            period: utilization.reporting_period,
            reportDate: utilization.report_date,
            registeredUsers: utilization.registered_users,
            actualUsers: utilization.actual_users,
            participationRate: utilization.participation_rate,
            downloads: utilization.downloads,
            reportedName: utilization.reported_name,
            previousPeriod: previousUtilization?.reporting_period ?? null,
            registeredUsersChange:
              utilization.registered_users != null && previousUtilization?.registered_users != null
                ? utilization.registered_users - previousUtilization.registered_users
                : null,
            actualUsersChange:
              utilization.actual_users != null && previousUtilization?.actual_users != null
                ? utilization.actual_users - previousUtilization.actual_users
                : null,
            participationRateChange:
              utilization.participation_rate != null && previousUtilization?.participation_rate != null
                ? utilization.participation_rate - previousUtilization.participation_rate
                : null,
            downloadsChange:
              utilization.downloads != null && previousUtilization?.downloads != null
                ? utilization.downloads - previousUtilization.downloads
                : null,
          }
        : null,
      current,
      previous,
      hasPrevious: Boolean(previous),
      rosterPeriods,
      summary,
      users,
      previousUsers,
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load school", 500)
  }
}
