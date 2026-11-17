export interface MemberRecord {
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

export interface ComparedMember {
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

export const PROFILE_FIELDS: Array<[keyof MemberRecord, string]> = [
  ["last_name", "Last name"],
  ["first_name", "First name"],
  ["middle_name", "Middle name"],
  ["gender", "Gender"],
  ["email", "Email"],
  ["portal_role", "Portal role"],
]

export function clean(value: string | null | undefined): string | null {
  if (value == null) return null
  const normalized = String(value).trim().replace(/\s+/g, " ")
  return normalized || null
}

function normalize(value: string | null | undefined): string {
  return (clean(value) ?? "").toLowerCase()
}

export function displayName(record: MemberRecord): string | null {
  const lastName = clean(record.last_name)
  const givenNames = [record.first_name, record.middle_name]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(" ")

  if (lastName && givenNames) return `${lastName}, ${givenNames}`
  return lastName || givenNames || null
}

function buildChangedFields(previous: MemberRecord, current: MemberRecord): ChangedField[] {
  const changed: ChangedField[] = []
  for (const [field, label] of PROFILE_FIELDS) {
    if (normalize(previous[field] as string | null) === normalize(current[field] as string | null)) continue
    changed.push({
      field: String(field),
      label,
      previous: clean(previous[field] as string | null),
      current: clean(current[field] as string | null),
    })
  }
  return changed
}

function emptyFlags(): MemberChangeFlags {
  return {
    new: false,
    removed: false,
    downloadsUp: false,
    downloadsDown: false,
    downloadsSame: false,
    profileUpdated: false,
    statusChanged: false,
  }
}

export function buildRosterMembers(records: MemberRecord[]): ComparedMember[] {
  return records.map((record) => ({
    memberId: record.member_id,
    fullName: displayName(record),
    lastName: clean(record.last_name),
    firstName: clean(record.first_name),
    middleName: clean(record.middle_name),
    gender: clean(record.gender),
    status: clean(record.account_status),
    email: clean(record.email),
    role: clean(record.portal_role),
    totalDownloads: record.total_downloads,
    previousDownloads: null,
    difference: null,
    percentageChange: null,
    registeredAt: record.registered_at,
    schoolId: clean(record.school_id),
    schoolName: clean(record.school_name),
    change: "existing",
    flags: emptyFlags(),
    changedFields: [],
  }))
}

function compare(previous: MemberRecord | undefined, current: MemberRecord): ComparedMember {
  if (!previous) {
    return {
      memberId: current.member_id,
      fullName: displayName(current),
      lastName: clean(current.last_name),
      firstName: clean(current.first_name),
      middleName: clean(current.middle_name),
      gender: clean(current.gender),
      status: clean(current.account_status),
      email: clean(current.email),
      role: clean(current.portal_role),
      totalDownloads: current.total_downloads,
      previousDownloads: null,
      difference: null,
      percentageChange: null,
      registeredAt: current.registered_at,
      schoolId: clean(current.school_id),
      schoolName: clean(current.school_name),
      change: "new",
      flags: { ...emptyFlags(), new: true },
      changedFields: [],
    }
  }

  const changedFields = buildChangedFields(previous, current)
  const statusChanged = normalize(previous.account_status) !== normalize(current.account_status)
  const difference =
    previous.total_downloads !== null && current.total_downloads !== null
      ? current.total_downloads - previous.total_downloads
      : null
  const percentageChange =
    difference !== null && previous.total_downloads
      ? (difference / previous.total_downloads) * 100
      : null

  const flags = emptyFlags()
  flags.downloadsUp = difference !== null && difference > 0
  flags.downloadsDown = difference !== null && difference < 0
  flags.downloadsSame = difference === 0
  flags.profileUpdated = changedFields.length > 0
  flags.statusChanged = statusChanged

  return {
    memberId: current.member_id,
    fullName: displayName(current),
    lastName: clean(current.last_name),
    firstName: clean(current.first_name),
    middleName: clean(current.middle_name),
    gender: clean(current.gender),
    status: clean(current.account_status),
    email: clean(current.email),
    role: clean(current.portal_role),
    totalDownloads: current.total_downloads,
    previousDownloads: previous.total_downloads,
    difference,
    percentageChange,
    registeredAt: current.registered_at,
    schoolId: clean(current.school_id),
    schoolName: clean(current.school_name),
    change: "existing",
    flags,
    changedFields,
  }
}

export function buildComparedMembers(
  previousRecords: MemberRecord[],
  currentRecords: MemberRecord[],
): ComparedMember[] {
  const previousById = new Map(previousRecords.map((record) => [record.member_id, record]))
  const currentById = new Map(currentRecords.map((record) => [record.member_id, record]))
  const results: ComparedMember[] = []

  for (const current of currentRecords) {
    results.push(compare(previousById.get(current.member_id), current))
  }

  for (const previous of previousRecords) {
    if (currentById.has(previous.member_id)) continue
    results.push({
      memberId: previous.member_id,
      fullName: displayName(previous),
      lastName: clean(previous.last_name),
      firstName: clean(previous.first_name),
      middleName: clean(previous.middle_name),
      gender: clean(previous.gender),
      status: clean(previous.account_status),
      email: clean(previous.email),
      role: clean(previous.portal_role),
      totalDownloads: previous.total_downloads,
      previousDownloads: previous.total_downloads,
      difference: null,
      percentageChange: null,
      registeredAt: previous.registered_at,
      schoolId: clean(previous.school_id),
      schoolName: clean(previous.school_name),
      change: "removed",
      flags: { ...emptyFlags(), removed: true },
      changedFields: [],
    })
  }

  return results
}

function emailTypeOf(email: string | null, classify: (value: string | null) => MemberEmailType): MemberEmailType {
  return classify(email)
}

export function summarizeMembers(
  compared: ComparedMember[],
  classify: (value: string | null) => MemberEmailType,
): MemberComparisonSummary {
  const current = compared.filter((member) => member.change !== "removed")
  const previousCount = compared.filter((member) => member.change !== "new").length
  const totalDownloads = current.reduce((total, member) => total + (member.totalDownloads ?? 0), 0)
  const previousDownloads = compared
    .filter((member) => member.change !== "new")
    .reduce((total, member) => total + (member.previousDownloads ?? 0), 0)

  let deped = 0
  let nonDeped = 0
  let invalidEmail = 0
  let active = 0
  let zeroDownloads = 0

  for (const member of current) {
    const emailType = emailTypeOf(member.email, classify)
    if (emailType === "deped") deped++
    else if (emailType === "non_deped") nonDeped++
    else invalidEmail++
    if ((member.status ?? "").toLowerCase() === "active") active++
    if ((member.totalDownloads ?? 0) === 0) zeroDownloads++
  }

  return {
    currentMembers: current.length,
    previousMembers: previousCount,
    totalDownloads,
    previousDownloads,
    downloadsDifference: totalDownloads - previousDownloads,
    deped,
    nonDeped,
    invalidEmail,
    active,
    inactive: current.length - active,
    zeroDownloads,
    newMembers: compared.filter((member) => member.flags.new).length,
    removedMembers: compared.filter((member) => member.flags.removed).length,
    retainedMembers: current.filter((member) => !member.flags.new).length,
    downloadsIncreased: current.filter((member) => member.flags.downloadsUp).length,
    downloadsDecreased: current.filter((member) => member.flags.downloadsDown).length,
    downloadsSame: current.filter((member) => member.flags.downloadsSame).length,
    profileUpdated: current.filter((member) => member.flags.profileUpdated).length,
    statusChanged: current.filter((member) => member.flags.statusChanged).length,
  }
}
