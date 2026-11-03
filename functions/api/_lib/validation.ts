import {
  cleanValue,
  parseDate,
  toNumber,
  type SheetData,
  type WorkbookData,
} from "../../../src/lib/workbook"

export type Module = "school" | "member"
export type RowStatus = "accepted" | "warning" | "rejected"

export interface ValidatedRow {
  rowNumber: number
  status: RowStatus
  errors: string[]
  warnings: string[]
  data: Record<string, any>
  raw: Record<string, any>
}

export interface ValidationResult {
  module: Module
  sheetName: string
  headers: string[]
  missingHeaders: string[]
  extraHeaders: string[]
  rows: ValidatedRow[]
  summary: {
    total: number
    accepted: number
    warnings: number
    rejected: number
  }
  limitations: string[]
}

const REQUIRED_HEADERS: Record<Module, string[]> = {
  school: [
    "SCHOOL ID",
    "SCHOOL NAME",
    "REGISTERED USERS",
    "ACTUAL USERS",
    "PARTICIPATION RATE",
    "DOWNLOADS",
  ],
  member: [
    "ID",
    "LAST NAME",
    "FIRST NAME",
    "MIDDLE NAME",
    "GENDER",
    "STATUS",
    "EMAIL",
    "PORTAL ROLE",
    "TOTAL DOWNLOADS",
    "REGISTERED",
  ],
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function headerKey(value: string): string {
  return cleanValue(value).toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function pickSheet(data: WorkbookData): SheetData | null {
  const sheets = data.sheets.filter((sheet) => sheet.rows.length > 0)
  return (
    sheets.find((sheet) => /lr portal data/i.test(sheet.name)) ??
    sheets[0] ??
    data.sheets[0] ??
    null
  )
}

export function validateWorkbook(data: WorkbookData, module: Module): ValidationResult {
  const sheet = pickSheet(data)
  const required = REQUIRED_HEADERS[module]
  const headers = sheet?.headers ?? []
  const headerMap = new Map<string, string>()

  for (const header of headers) {
    headerMap.set(headerKey(header), header)
  }

  const missingHeaders = required.filter((header) => !headerMap.has(headerKey(header)))
  const extraHeaders = headers.filter(
    (header) => !required.some((requiredHeader) => headerKey(requiredHeader) === headerKey(header)),
  )

  const rows: ValidatedRow[] = []
  const seenIds = new Set<string>()

  for (let index = 0; index < (sheet?.rows.length ?? 0); index++) {
    const raw = sheet!.rows[index]
    const errors: string[] = []
    const warnings: string[] = []
    const data: Record<string, any> = {}

    const valueOf = (header: string): string => {
      const actual = headerMap.get(headerKey(header))
      return actual ? cleanValue(raw[actual]) : ""
    }

    if (missingHeaders.length) {
      errors.push(`Missing required column(s): ${missingHeaders.join(", ")}`)
    }

    if (module === "school") {
      const schoolId = valueOf("SCHOOL ID")
      if (!schoolId) {
        errors.push("Missing SCHOOL ID")
      } else if (seenIds.has(schoolId)) {
        errors.push(`Duplicate SCHOOL ID in file: ${schoolId}`)
      } else {
        seenIds.add(schoolId)
      }

      data["SCHOOL ID"] = schoolId
      data["SCHOOL NAME"] = valueOf("SCHOOL NAME")

      for (const field of ["REGISTERED USERS", "ACTUAL USERS", "PARTICIPATION RATE", "DOWNLOADS"]) {
        const rawValue = valueOf(field)
        const number = toNumber(rawValue)

        if (rawValue !== "" && number === null) {
          errors.push(`Invalid numeric value for ${field}: ${rawValue}`)
        }
        if (number !== null && number < 0) {
          errors.push(`Negative value for ${field}: ${number}`)
        }
        if (field === "PARTICIPATION RATE" && number !== null && number > 100) {
          warnings.push(`Participation rate above 100: ${number}`)
        }

        data[field] = number
      }
    } else {
      const memberId = valueOf("ID")
      if (!memberId) {
        errors.push("Missing member ID")
      } else if (seenIds.has(memberId)) {
        errors.push(`Duplicate member ID in file: ${memberId}`)
      } else {
        seenIds.add(memberId)
      }

      const email = valueOf("EMAIL")
      if (!email) {
        warnings.push("Missing email address")
      } else if (!EMAIL_PATTERN.test(email)) {
        warnings.push(`Invalid email format: ${email}`)
      }

      const rawDownloads = valueOf("TOTAL DOWNLOADS")
      const totalDownloads = toNumber(rawDownloads)
      if (rawDownloads !== "" && totalDownloads === null) {
        errors.push(`Invalid numeric value for TOTAL DOWNLOADS: ${rawDownloads}`)
      }
      if (totalDownloads !== null && totalDownloads < 0) {
        errors.push(`Negative value for TOTAL DOWNLOADS: ${totalDownloads}`)
      }

      const registeredRaw = valueOf("REGISTERED")
      const registeredAt = parseDate(registeredRaw)
      if (registeredRaw && !registeredAt) {
        warnings.push(`Invalid registration date: ${registeredRaw}`)
      }

      data["ID"] = memberId
      data["LAST NAME"] = valueOf("LAST NAME")
      data["FIRST NAME"] = valueOf("FIRST NAME")
      data["MIDDLE NAME"] = valueOf("MIDDLE NAME")
      data["GENDER"] = valueOf("GENDER")
      data["STATUS"] = valueOf("STATUS")
      data["EMAIL"] = email
      data["PORTAL ROLE"] = valueOf("PORTAL ROLE")
      data["TOTAL DOWNLOADS"] = totalDownloads
      data["REGISTERED"] = registeredAt ? registeredAt.toISOString() : null
    }

    const status: RowStatus = errors.length ? "rejected" : warnings.length ? "warning" : "accepted"
    rows.push({
      rowNumber: index + 2,
      status,
      errors,
      warnings,
      data,
      raw,
    })
  }

  const limitations: string[] = []
  if (module === "member") {
    const hasAssignmentFields = ["SCHOOL ID", "SCHOOL NAME", "DISTRICT"].some((field) =>
      headerMap.has(headerKey(field)),
    )
    if (!hasAssignmentFields) {
      limitations.push("Transfer information unavailable in this export.")
    }
  }

  return {
    module,
    sheetName: sheet?.name ?? "",
    headers,
    missingHeaders,
    extraHeaders,
    rows,
    summary: {
      total: rows.length,
      accepted: rows.filter((row) => row.status === "accepted").length,
      warnings: rows.filter((row) => row.status === "warning").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
    },
    limitations,
  }
}
