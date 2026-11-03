import * as XLSX from "xlsx"

export type SheetData = { name: string; headers: string[]; rows: Record<string, any>[]; raw: any[][] }
export type WorkbookData = { fileName: string; sheets: SheetData[] }

export function detectModuleFromHeaders(headers: string[]): "school" | "member" | null {
  const normalized = headers.map((header) => header.toLowerCase())
  if (
    normalized.includes("school id") ||
    normalized.includes("school name") ||
    normalized.includes("registered users")
  ) {
    return "school"
  }
  if (
    normalized.includes("portal role") ||
    (normalized.includes("total downloads") && normalized.includes("gender"))
  ) {
    return "member"
  }
  if (normalized.some((header) => header.includes("school"))) return "school"
  if (normalized.some((header) => header.includes("gender") || header.includes("portal role"))) {
    return "member"
  }
  return null
}

export function cleanValue(v: any): string {
  if (v == null) return ""
  return String(v).trim().replace(/\s+/g, " ")
}

export function toNumber(v: any): number | null {
  if (v === "" || v == null) return null
  const s = String(v).trim().replace(/,/g, "").replace(/%/g, "").replace(/\s/g, "")
  if (s === "" || s === "-" || s === "--") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function isDateLike(v: any): boolean {
  if (v instanceof Date && !isNaN(v.getTime())) return true
  const s = String(v).trim()
  if (!s) return false
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return !isNaN(Date.parse(s))
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return !isNaN(Date.parse(s))
  return false
}

export function parseDate(v: any): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function parseWorkbookBuffer(buffer: ArrayBuffer, fileName: string): WorkbookData {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true })
  const sheets: SheetData[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: true,
    }) as any[][]
    if (!raw.length) return { name, headers: [], rows: [], raw }

    let headerIdx = 0
    for (let i = 0; i < Math.min(6, raw.length); i++) {
      const ne = raw[i].filter((c: any) => cleanValue(c) !== "").length
      if (ne >= 2) {
        headerIdx = i
        break
      }
    }

    const rawHeaders = raw[headerIdx].map((h: any) => cleanValue(h))
    const colCount = Math.max(...raw.slice(headerIdx).map((r) => r.length), rawHeaders.length)
    while (rawHeaders.length < colCount) rawHeaders.push("")

    const keepIdx: number[] = []
    for (let c = 0; c < colCount; c++) {
      const hasH = cleanValue(rawHeaders[c]) !== ""
      let hasD = false
      for (let r = headerIdx + 1; r < raw.length; r++) {
        if (cleanValue(raw[r]?.[c]) !== "") {
          hasD = true
          break
        }
      }
      if (!hasH && !hasD) continue
      keepIdx.push(c)
    }

    const finalIdx = keepIdx.length ? keepIdx : rawHeaders.map((_, i) => i)
    const headersRaw = finalIdx.map((i) => cleanValue(rawHeaders[i]) || `Column ${i + 1}`)
    const seen: Record<string, number> = {}
    const headers = headersRaw.map((h) => {
      const base = h.trim() || "Column"
      if (seen[base] == null) {
        seen[base] = 1
        return base
      }
      seen[base]++
      return `${base} ${seen[base]}`
    })

    const rows: Record<string, any>[] = []
    for (let r = headerIdx + 1; r < raw.length; r++) {
      const arr = raw[r] || []
      if (arr.every((c) => cleanValue(c) === "")) continue
      if (!finalIdx.some((i) => cleanValue(arr[i]) !== "")) continue
      const obj: Record<string, any> = {}
      headers.forEach((h, idx) => {
        const colI = finalIdx[idx]
        let v: any = arr[colI] ?? ""
        if (v instanceof Date) v = v.toISOString().slice(0, 10)
        else v = cleanValue(v)
        obj[h] = v
      })
      rows.push(obj)
    }

    return { name, headers, rows, raw }
  })

  return { fileName, sheets }
}
