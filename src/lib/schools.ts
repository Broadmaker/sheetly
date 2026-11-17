export interface SchoolsSummary {
  totalSchools: number
  masterSchools: number
  extraSchools: number
  withUtilization: number
  withoutUtilization: number
  withRoster: number
  withoutRoster: number
}

export interface SchoolListItem {
  schoolId: string
  schoolName: string
  divisionId: string | null
  divisionName: string | null
  isMaster: boolean
  lastSeenPeriod: string | null
  inLatestUserCount: boolean
  hasUtilization: boolean
  nameMismatch: boolean
  reportedName: string | null
  registeredUsers: number | null
  actualUsers: number | null
  participationRate: number | null
  downloads: number | null
  hasPreviousUtilization: boolean
  registeredUsersChange: number | null
  actualUsersChange: number | null
  participationRateChange: number | null
  downloadsChange: number | null
  userUploadCount: number
  latestRosterPeriod: string | null
  latestRosterCount: number | null
}

export interface SchoolsResponse {
  latestPeriod: string | null
  previousPeriod: string | null
  summary: SchoolsSummary
  schools: SchoolListItem[]
}

export type MemberEmailType = "deped" | "non_deped" | "invalid_missing"

export interface MemberChangeFlags {
  new: boolean
  removed: boolean
  downloadsUp: boolean
  downloadsDown: boolean
  downloadsSame: boolean
  profileUpdated: boolean
  statusChanged: boolean
}

export interface ChangedField {
  field: string
  label: string
  previous: string | null
  current: string | null
}

export interface SchoolUser {
  memberId: string
  fullName: string | null
  lastName: string | null
  firstName: string | null
  middleName: string | null
  gender: string | null
  status: string | null
  email: string | null
  role: string | null
  totalDownloads: number | null
  previousDownloads: number | null
  difference: number | null
  percentageChange: number | null
  registeredAt: string | null
  schoolId: string | null
  schoolName: string | null
  change: "new" | "removed" | "existing"
  flags: MemberChangeFlags
  changedFields: ChangedField[]
  emailType: MemberEmailType
}

export interface MemberComparisonSummary {
  currentMembers: number
  previousMembers: number
  totalDownloads: number
  previousDownloads: number
  downloadsDifference: number
  deped: number
  nonDeped: number
  invalidEmail: number
  active: number
  inactive: number
  zeroDownloads: number
  newMembers: number
  removedMembers: number
  retainedMembers: number
  downloadsIncreased: number
  downloadsDecreased: number
  downloadsSame: number
  profileUpdated: number
  statusChanged: number
}

export interface SchoolPeriod {
  snapshotId: string
  period: string
  recordCount: number
  uploadedAt: string
  downloadBasis: string
  filename: string
}

export interface SchoolDetailResponse {
  school: {
    schoolId: string
    schoolName: string
    divisionId: string | null
    divisionName: string | null
    isMaster: boolean
    lastSeenPeriod: string | null
    reportedName: string | null
    nameMismatch: boolean
  }
  utilization: {
    period: string
    reportDate: string
    registeredUsers: number | null
    actualUsers: number | null
    participationRate: number | null
    downloads: number | null
    reportedName: string | null
    previousPeriod: string | null
    registeredUsersChange: number | null
    actualUsersChange: number | null
    participationRateChange: number | null
    downloadsChange: number | null
  } | null
  current: SchoolPeriod | null
  previous: SchoolPeriod | null
  hasPrevious: boolean
  rosterPeriods: SchoolPeriod[]
  summary: MemberComparisonSummary
  users: SchoolUser[]
  previousUsers: SchoolUser[]
}

export function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("en-US")
}

export function fmtCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return fmt(Math.round(value))
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function fmtPeriod(period: string | null | undefined): string {
  if (!period) return "—"
  const [year, month] = period.split("-")
  const index = Number(month) - 1
  if (index < 0 || index > 11) return period
  return `${MONTHS[index].slice(0, 3)} ${year}`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export function formatPersonName(value: string | null | undefined): string {
  if (!value) return "—"
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
  if (!normalized) return "—"

  return normalized
    .replace(/(^|[\s,\-'’])(\p{L})/gu, (_match, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase("en-US")}`,
    )
    .replace(/\bJr\.?\b/g, "Jr.")
    .replace(/\bSr\.?\b/g, "Sr.")
    .replace(/\bIi\b/g, "II")
    .replace(/\bIii\b/g, "III")
    .replace(/\bIv\b/g, "IV")
}

export function formatCategory(value: string | null | undefined): string {
  if (!value) return "—"
  const normalized = value.trim().replace(/[_\s]+/g, " ").toLocaleLowerCase("en-US")
  if (!normalized) return "—"

  return normalized
    .replace(/(^|[\s\-/])(\p{L})/gu, (_match, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase("en-US")}`,
    )
    .replace(/\bIct\b/g, "ICT")
    .replace(/\bLr\b/g, "LR")
}

export function activityBucket(downloads: number | null | undefined): "No Activity" | "Low Activity" | "Moderate Activity" | "High Activity" {
  const value = downloads ?? 0
  if (value <= 0) return "No Activity"
  if (value <= 20) return "Low Activity"
  if (value <= 100) return "Moderate Activity"
  return "High Activity"
}

export function emailTypeLabel(type: MemberEmailType): string {
  if (type === "deped") return "DepEd"
  if (type === "non_deped") return "Non-DepEd"
  return "Missing/Invalid"
}

export function emailTypeClasses(type: MemberEmailType): string {
  if (type === "deped") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (type === "non_deped") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-slate-100 text-slate-600 border-slate-200"
}

export function downloadCsv(fileName: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): void {
  function escapeCell(value: string | number | null | undefined): string {
    if (value == null) return ""
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
