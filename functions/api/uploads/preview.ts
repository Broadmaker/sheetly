import { parseWorkbookBuffer } from "../../../src/lib/workbook"
import { sha256Hex } from "../_lib/crypto"
import { validateWorkbook, type Module } from "../_lib/validation"

interface Env {
  DB: D1Database
  UPLOADS: R2Bucket
}

interface UploadFields {
  file: File
  module: Module
  reportingPeriod: string
  exportDate: string | null
  buffer: ArrayBuffer
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

async function readUpload(request: Request): Promise<UploadFields | Response> {
  const form = await request.formData()
  const file = form.get("file")
  const moduleValue = String(form.get("module") ?? "")
  const reportingPeriod = String(form.get("reportingPeriod") ?? "").trim()
  const exportDate = String(form.get("exportDate") ?? "").trim() || null

  if (!(file instanceof File)) return jsonError("Missing Excel file")
  if (moduleValue !== "school" && moduleValue !== "member") {
    return jsonError("module must be either school or member")
  }
  if (!reportingPeriod) return jsonError("reportingPeriod is required")

  const buffer = await file.arrayBuffer()
  if (!buffer.byteLength) return jsonError("File is empty")

  return {
    file,
    module: moduleValue,
    reportingPeriod,
    exportDate,
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
    "SELECT id, status, uploaded_at FROM uploads WHERE module = ? AND checksum_sha256 = ? AND reporting_period = ?",
  )
    .bind(upload.module, checksum, upload.reportingPeriod)
    .first<{ id: string; status: string; uploaded_at: string }>()

  return Response.json({
    file: {
      name: upload.file.name,
      size: upload.buffer.byteLength,
      checksum,
    },
    module: upload.module,
    reportingPeriod: upload.reportingPeriod,
    exportDate: upload.exportDate,
    validation,
    duplicate: existing
      ? { id: existing.id, status: existing.status, uploadedAt: existing.uploaded_at }
      : null,
    previewRows: validation.rows.slice(0, 100),
  })
}
