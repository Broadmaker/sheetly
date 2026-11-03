import { parseWorkbookBuffer } from "../../../src/lib/workbook"
import { sha256Hex } from "../_lib/crypto"
import { validateWorkbook, type Module, type ValidatedRow } from "../_lib/validation"

interface Env {
  DB: D1Database
  UPLOADS: R2Bucket
}

interface CommitFields {
  file: File
  module: Module
  reportingPeriod: string
  exportDate: string | null
  downloadBasis: "cumulative" | "period" | "unknown"
  buffer: ArrayBuffer
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

async function readCommit(request: Request): Promise<CommitFields | Response> {
  const form = await request.formData()
  const file = form.get("file")
  const moduleValue = String(form.get("module") ?? "")
  const reportingPeriod = String(form.get("reportingPeriod") ?? "").trim()
  const exportDate = String(form.get("exportDate") ?? "").trim() || null
  const downloadBasisValue = String(form.get("downloadBasis") ?? "unknown")

  if (!(file instanceof File)) return jsonError("Missing Excel file")
  if (moduleValue !== "school" && moduleValue !== "member") {
    return jsonError("module must be either school or member")
  }
  if (!reportingPeriod) return jsonError("reportingPeriod is required")
  if (!["cumulative", "period", "unknown"].includes(downloadBasisValue)) {
    return jsonError("downloadBasis must be cumulative, period, or unknown")
  }

  const buffer = await file.arrayBuffer()
  if (!buffer.byteLength) return jsonError("File is empty")

  return {
    file,
    module: moduleValue,
    reportingPeriod,
    exportDate,
    downloadBasis: downloadBasisValue as CommitFields["downloadBasis"],
    buffer,
  }
}

function safeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
}

function fileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? ""
  return ["xls", "xlsx", "csv"].includes(extension) ? extension : "xls"
}

function normalizeName(row: ValidatedRow): string {
  return [row.data["LAST NAME"], row.data["FIRST NAME"], row.data["MIDDLE NAME"]]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function schoolRecordStatement(
  db: D1Database,
  snapshotId: string,
  row: ValidatedRow,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO school_snapshot_records
        (id, snapshot_id, school_id, school_name, registered_users, actual_users, participation_rate, downloads, raw_json, row_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      snapshotId,
      row.data["SCHOOL ID"],
      row.data["SCHOOL NAME"] || null,
      row.data["REGISTERED USERS"],
      row.data["ACTUAL USERS"],
      row.data["PARTICIPATION RATE"],
      row.data["DOWNLOADS"],
      JSON.stringify(row.raw),
      row.status,
    )
}

function memberRecordStatement(
  db: D1Database,
  snapshotId: string,
  row: ValidatedRow,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO member_snapshot_records
        (id, snapshot_id, member_id, last_name, first_name, middle_name, full_name_normalized,
         gender, account_status, email, email_normalized, portal_role, total_downloads,
         registered_at, raw_json, row_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      snapshotId,
      row.data["ID"],
      row.data["LAST NAME"] || null,
      row.data["FIRST NAME"] || null,
      row.data["MIDDLE NAME"] || null,
      normalizeName(row) || null,
      row.data["GENDER"] || null,
      row.data["STATUS"] || null,
      row.data["EMAIL"] || null,
      row.data["EMAIL"] ? String(row.data["EMAIL"]).trim().toLowerCase() : null,
      row.data["PORTAL ROLE"] || null,
      row.data["TOTAL DOWNLOADS"],
      row.data["REGISTERED"],
      JSON.stringify(row.raw),
      row.status,
    )
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const upload = await readCommit(request)
  if (upload instanceof Response) return upload

  let workbook
  try {
    workbook = parseWorkbookBuffer(upload.buffer, upload.file.name)
  } catch {
    return jsonError("Unable to parse the workbook. Upload a valid .xls, .xlsx, or .csv file.", 422)
  }

  const validation = validateWorkbook(workbook, upload.module)

  if (validation.missingHeaders.length || validation.summary.total === 0) {
    return Response.json(
      { error: "The file does not match the required layout.", validation },
      { status: 422 },
    )
  }

  if (validation.summary.rejected > 0) {
    return Response.json(
      {
        error: "The file contains rejected records. Fix them before committing.",
        validation,
      },
      { status: 422 },
    )
  }

  const checksum = await sha256Hex(upload.buffer)
  const existing = await env.DB.prepare(
    "SELECT id, status, uploaded_at FROM uploads WHERE module = ? AND checksum_sha256 = ? AND reporting_period = ?",
  )
    .bind(upload.module, checksum, upload.reportingPeriod)
    .first<{ id: string; status: string; uploaded_at: string }>()

  if (existing) {
    return Response.json(
      {
        error: "This file was already uploaded for the selected reporting period.",
        duplicate: { id: existing.id, status: existing.status, uploadedAt: existing.uploaded_at },
      },
      { status: 409 },
    )
  }

  const uploadId = crypto.randomUUID()
  const snapshotId = crypto.randomUUID()
  const key = `uploads/${upload.module}/${safeKeyPart(upload.reportingPeriod)}/${checksum}.${fileExtension(upload.file.name)}`

  try {
    await env.UPLOADS.put(key, upload.buffer, {
      httpMetadata: {
        contentType: upload.file.type || "application/vnd.ms-excel",
      },
      customMetadata: {
        originalFilename: upload.file.name,
        module: upload.module,
        reportingPeriod: upload.reportingPeriod,
        checksum,
      },
    })
  } catch {
    return jsonError("Unable to store the uploaded file.", 502)
  }

  const validationSummary = {
    summary: validation.summary,
    missingHeaders: validation.missingHeaders,
    extraHeaders: validation.extraHeaders,
    limitations: validation.limitations,
  }

  const uploadStatement = env.DB.prepare(
    `INSERT INTO uploads
      (id, module, original_filename, r2_key, checksum_sha256, size_bytes, reporting_period,
       export_date, status, validation_summary_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?)`,
  ).bind(
    uploadId,
    upload.module,
    upload.file.name,
    key,
    checksum,
    upload.buffer.byteLength,
    upload.reportingPeriod,
    upload.exportDate,
    JSON.stringify(validationSummary),
  )

  const snapshotStatement = env.DB.prepare(
    `INSERT INTO snapshots
      (id, upload_id, module, reporting_period, export_date, download_basis, record_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    snapshotId,
    uploadId,
    upload.module,
    upload.reportingPeriod,
    upload.exportDate,
    upload.downloadBasis,
    validation.summary.total,
  )

  const auditStatement = env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, after_json)
     VALUES (?, 'upload.commit', 'snapshot', ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    snapshotId,
    JSON.stringify({
      module: upload.module,
      reportingPeriod: upload.reportingPeriod,
      fileName: upload.file.name,
      checksum,
      summary: validation.summary,
    }),
  )

  const recordStatements = validation.rows.map((row) =>
    upload.module === "school"
      ? schoolRecordStatement(env.DB, snapshotId, row)
      : memberRecordStatement(env.DB, snapshotId, row),
  )

  try {
    await env.DB.batch([uploadStatement, snapshotStatement, auditStatement])
    for (const records of chunk(recordStatements, 250)) {
      await env.DB.batch(records)
    }
  } catch {
    await env.UPLOADS.delete(key).catch(() => undefined)
    await env.DB.batch([
      env.DB.prepare("DELETE FROM school_snapshot_records WHERE snapshot_id = ?").bind(snapshotId),
      env.DB.prepare("DELETE FROM member_snapshot_records WHERE snapshot_id = ?").bind(snapshotId),
      env.DB.prepare("DELETE FROM snapshots WHERE id = ?").bind(snapshotId),
      env.DB.prepare("DELETE FROM uploads WHERE id = ?").bind(uploadId),
    ]).catch(() => undefined)

    return jsonError("Unable to save the snapshot.", 500)
  }

  return Response.json(
    {
      upload: {
        id: uploadId,
        module: upload.module,
        fileName: upload.file.name,
        checksum,
        sizeBytes: upload.buffer.byteLength,
        reportingPeriod: upload.reportingPeriod,
        exportDate: upload.exportDate,
      },
      snapshot: {
        id: snapshotId,
        module: upload.module,
        reportingPeriod: upload.reportingPeriod,
        exportDate: upload.exportDate,
        downloadBasis: upload.downloadBasis,
        recordCount: validation.summary.total,
      },
      validation: validationSummary,
    },
    { status: 201 },
  )
}
