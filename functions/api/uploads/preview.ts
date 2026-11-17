import { parseWorkbookBuffer } from "../../../src/lib/workbook"
import { sha256Hex } from "../_lib/crypto"
import { classifyEmail, getActiveDomains } from "../_lib/email-policy"
import { validateWorkbook, type Module } from "../_lib/validation"
import {
  cleanSchoolId,
  getSchool,
  parsePeriodFromFilename,
  parseSchoolIdFromFilename,
  type SchoolInfo,
} from "../_lib/school-scope"

interface Env {
  DB: D1Database
  UPLOADS: R2Bucket
}

interface UploadFields {
  file: File
  module: Module
  reportingPeriod: string
  exportDate: string | null
  schoolId: string | null
  detectedSchoolId: string | null
  buffer: ArrayBuffer
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

async function readUpload(request: Request): Promise<UploadFields | Response> {
  const form = await request.formData()
  const file = form.get("file")
  const moduleValue = String(form.get("module") ?? "")
  const inferredPeriod = file instanceof File ? parsePeriodFromFilename(file.name) : null
  const requestedPeriod = String(form.get("reportingPeriod") ?? "").trim()
  const reportingPeriod = requestedPeriod || inferredPeriod?.period || ""
  const requestedExportDate = String(form.get("exportDate") ?? "").trim() || null
  const exportDate = requestedExportDate ?? inferredPeriod?.exportDate ?? null
  const requestedSchoolId = cleanSchoolId(form.get("schoolId"))
  const detectedSchoolId = file instanceof File ? parseSchoolIdFromFilename(file.name) : null
  const schoolId = requestedSchoolId ?? detectedSchoolId

  if (!(file instanceof File)) return jsonError("Missing Excel file")
  if (moduleValue !== "school" && moduleValue !== "member") {
    return jsonError("module must be either school or member")
  }
  if (!reportingPeriod) return jsonError("reportingPeriod is required. Include a date like 20261031 in the filename or send reportingPeriod.")
  if (moduleValue === "member" && !schoolId) {
    return jsonError(
      "Select the school this user file belongs to. The filename does not include a deped-school-id.",
    )
  }

  const buffer = await file.arrayBuffer()
  if (!buffer.byteLength) return jsonError("File is empty")

  return {
    file,
    module: moduleValue,
    reportingPeriod,
    exportDate,
    schoolId: moduleValue === "member" ? schoolId : null,
    detectedSchoolId,
    buffer,
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const upload = await readUpload(request)
  if (upload instanceof Response) return upload

  let workbook
  try {
    workbook = parseWorkbookBuffer(upload.buffer, upload.file.name)
  } catch {
    return jsonError("Unable to parse the workbook. Upload a valid .xls, .xlsx, or .csv file.", 422)
  }

  const validation = validateWorkbook(workbook, upload.module)
  const checksum = await sha256Hex(upload.buffer)

  const existing = await env.DB.prepare(
    `SELECT id, status, uploaded_at FROM uploads
     WHERE module = ? AND checksum_sha256 = ? AND reporting_period = ?
       AND COALESCE(school_id, '') = COALESCE(?, '')`,
  )
    .bind(upload.module, checksum, upload.reportingPeriod, upload.schoolId)
    .first<{ id: string; status: string; uploaded_at: string }>()

  let school: SchoolInfo | null = null
  let emailSummary: { deped: number; nonDeped: number; invalid: number } | null = null

  if (upload.module === "member" && upload.schoolId) {
    school = await getSchool(env.DB, upload.schoolId)

    const domains = await getActiveDomains(env.DB)
    const approvedDomains = domains.length ? domains : ["deped.gov.ph"]
    emailSummary = { deped: 0, nonDeped: 0, invalid: 0 }

    for (const row of validation.rows) {
      const { classification } = classifyEmail(row.data["EMAIL"], approvedDomains)
      if (classification === "deped_domain") emailSummary.deped++
      else if (classification === "non_deped_domain") emailSummary.nonDeped++
      else emailSummary.invalid++
    }
  }

  return Response.json({
    file: {
      name: upload.file.name,
      size: upload.buffer.byteLength,
      checksum,
    },
    module: upload.module,
    reportingPeriod: upload.reportingPeriod,
    exportDate: upload.exportDate,
    schoolId: upload.schoolId,
    detectedSchoolId: upload.detectedSchoolId,
    school,
    schoolMatched: Boolean(school),
    emailSummary,
    validation: {
      module: validation.module,
      sheetName: validation.sheetName,
      headers: validation.headers,
      missingHeaders: validation.missingHeaders,
      extraHeaders: validation.extraHeaders,
      summary: validation.summary,
      limitations: validation.limitations,
    },
    duplicate: existing
      ? { id: existing.id, status: existing.status, uploadedAt: existing.uploaded_at }
      : null,
    previewRows: validation.rows.slice(0, 100),
  })
}
