export type AppView =
  | "overview"
  | "uploads"
  | "trends"
  | "dashboard"
  | "school"
  | "users"
  | "comparison"
  | "duplicates"
  | "data"

export const REPORT_VIEWS: AppView[] = ["dashboard", "school", "users", "data"]

export interface NavItem {
  view: AppView
  label: string
  hint: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { view: "overview", label: "Overview", hint: "Admin dashboard" },
      { view: "uploads", label: "Uploads & Snapshots", hint: "Import and save" },
      { view: "trends", label: "Snapshot Trends", hint: "Monthly history" },
    ],
  },
  {
    title: "Analysis",
    items: [
      { view: "dashboard", label: "Report Dashboard", hint: "KPIs and charts" },
      { view: "school", label: "School Analysis", hint: "Rankings and activity" },
      { view: "users", label: "User Analysis", hint: "Registered users" },
      { view: "comparison", label: "Comparison", hint: "Period to period" },
      { view: "duplicates", label: "Duplicate Review", hint: "Account matches" },
    ],
  },
  {
    title: "Data",
    items: [{ view: "data", label: "Detailed Data", hint: "Rows and quality" }],
  },
]
