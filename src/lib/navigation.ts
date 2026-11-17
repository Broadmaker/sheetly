export type AppView =
  | "overview"
  | "uploads"
  | "directory"
  | "roster"
  | "trends"
  | "dashboard"
  | "school"
  | "users"
  | "comparison"
  | "duplicates"
  | "find"
  | "email"
  | "history"
  | "audit"
  | "data"

export const REPORT_VIEWS: AppView[] = ["dashboard", "school", "users", "data"]

export interface NavItem {
  view: AppView
  label: string
  hint: string
  unavailable?: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { view: "overview", label: "Overview", hint: "Summary and recent uploads" },
      { view: "uploads", label: "Uploads & Snapshots", hint: "School list and user files" },
      { view: "directory", label: "Schools", hint: "Fixed master school list" },
    ],
  },
  {
    title: "School Users",
    items: [
      { view: "roster", label: "School Users", hint: "Rosters and changes" },
    ],
  },
  {
    title: "Unavailable",
    items: [
      { view: "trends", label: "Snapshot Trends", hint: "Temporarily unavailable", unavailable: true },
      { view: "dashboard", label: "Report Dashboard", hint: "Temporarily unavailable", unavailable: true },
      { view: "school", label: "School Analysis", hint: "Temporarily unavailable", unavailable: true },
      { view: "users", label: "User Analysis", hint: "Temporarily unavailable", unavailable: true },
      { view: "comparison", label: "Comparison", hint: "Temporarily unavailable", unavailable: true },
      { view: "duplicates", label: "Duplicate Review", hint: "Temporarily unavailable", unavailable: true },
      { view: "find", label: "Find a Member", hint: "Temporarily unavailable", unavailable: true },
      { view: "email", label: "Email Validation", hint: "Temporarily unavailable", unavailable: true },
    ],
  },
  {
    title: "Records",
    items: [
      { view: "history", label: "Upload History", hint: "Temporarily unavailable", unavailable: true },
      { view: "audit", label: "Audit Logs", hint: "Temporarily unavailable", unavailable: true },
      { view: "data", label: "Detailed Data", hint: "Temporarily unavailable", unavailable: true },
    ],
  },
]
