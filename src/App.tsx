import { useEffect, useState } from "react"
import AppSidebar, { Brand, MobileNav } from "./components/AppSidebar"
import SchoolDirectory from "./components/SchoolDirectory"
import SchoolUsers from "./components/SchoolUsers"
import ImportPanel from "./components/ImportPanel"
import WorkspaceOverview from "./components/WorkspaceOverview"
import Login from "./components/Login"
import { NAV_SECTIONS, type AppView } from "./lib/navigation"
import { AlertIcon, ExternalLinkIcon, GithubIcon, LockIcon, UploadIcon } from "./components/icons"

const VIEW_TITLES: Record<AppView, string> = {
  overview: "Overview",
  uploads: "Uploads & Snapshots",
  directory: "Schools",
  roster: "School Users",
  trends: "Snapshot Trends",
  dashboard: "Report Dashboard",
  school: "School Analysis",
  users: "User Analysis",
  comparison: "Comparison",
  duplicates: "Duplicate Review",
  find: "Find a Member",
  email: "Email Validation",
  history: "Upload History",
  audit: "Audit Logs",
  data: "Detailed Data",
}

const VIEW_DESCRIPTIONS: Record<AppView, string> = {
  overview: "Division-level school roster and utilization summary",
  uploads: "Import, validate, and save reporting snapshots",
  directory: "Browse the fixed master list and school coverage",
  roster: "Review users and compare roster periods",
  trends: "Review changes across reporting periods",
  dashboard: "Division reporting and performance indicators",
  school: "School-level utilization analysis",
  users: "Member-level account and activity analysis",
  comparison: "Compare reporting periods and records",
  duplicates: "Review possible duplicate member records",
  find: "Locate a member across school rosters",
  email: "Review account email quality and compliance",
  history: "Review completed file imports",
  audit: "Review system and data actions",
  data: "Inspect detailed reporting records",
}

const UNAVAILABLE_VIEWS = new Set<AppView>(
  NAV_SECTIONS.flatMap((section) => section.items)
    .filter((item) => item.unavailable)
    .map((item) => item.view),
)

function AppShell({ user, onLogout }: { user: string; onLogout: () => void }) {
  const [view, setView] = useState<AppView>("overview")
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)

  function navigate(next: AppView) {
    if (UNAVAILABLE_VIEWS.has(next)) return
    setView(next)
  }

  function openSchool(schoolId: string) {
    setSelectedSchoolId(schoolId)
    setView("roster")
  }

  function goUpload() {
    setView("uploads")
  }

  function goDirectory() {
    setView("directory")
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 selection:bg-indigo-200">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-full focus:text-sm focus:font-semibold">Skip to main content</a>
      <div className="lg:flex">
        <AppSidebar view={view} onNavigate={navigate} user={user} onLogout={onLogout} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 shadow-[0_8px_30px_-26px_rgba(15,23,42,0.65)] backdrop-blur-xl">
            <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
              <div className="lg:hidden"><Brand /></div>
              <div className="hidden min-w-0 items-center gap-3 lg:flex">
                <div className="h-9 w-1 rounded-full bg-gradient-to-b from-indigo-600 to-violet-500" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black tracking-tight text-slate-950">{VIEW_TITLES[view]}</div>
                  <div className="truncate text-[11px] text-slate-500">{VIEW_DESCRIPTIONS[view]}</div>
                </div>
                {UNAVAILABLE_VIEWS.has(view) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"><LockIcon className="size-3" /> Unavailable</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 xl:inline-flex">
                  <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
                  Workspace ready
                </span>
                {view !== "uploads" && <button onClick={goUpload} className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 sm:inline-flex"><UploadIcon className="size-4" /> Upload data</button>}
                <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 sm:flex">
                  <span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-[10px] font-black uppercase text-white">{user.slice(0, 2) || "LR"}</span>
                  <span className="max-w-28 truncate text-xs font-semibold text-slate-700">{user}</span>
                </div>
                <button onClick={onLogout} title={`Signed in as ${user}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-indigo-500">Sign out</button>
              </div>
            </div>
          </header>
          <MobileNav view={view} onNavigate={navigate} />

          <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {view === "overview" && <WorkspaceOverview user={user} onNavigate={navigate} onOpenSchool={openSchool} />}
            {view === "uploads" && <ImportPanel onOpenSchool={openSchool} onViewDirectory={goDirectory} />}
            {view === "directory" && <SchoolDirectory onOpenSchool={openSchool} onGoUpload={goUpload} />}
            {view === "roster" && (
              <SchoolUsers
                schoolId={selectedSchoolId}
                onChooseSchool={goDirectory}
                onGoUpload={goUpload}
                onBack={goDirectory}
              />
            )}
            {UNAVAILABLE_VIEWS.has(view) && (
              <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[26px] border border-amber-200 bg-gradient-to-br from-white to-amber-50/60 p-8 text-center shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)] sm:p-12">
                <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-amber-200/30 blur-3xl" />
                <div className="relative">
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm"><AlertIcon className="size-7" /></div>
                  <div className="mt-4 text-xl font-black tracking-tight text-slate-950">{VIEW_TITLES[view]} is not available yet</div>
                  <div className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">This module is intentionally paused while the school directory, uploads, and roster workflows are completed and verified.</div>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <button onClick={() => navigate("directory")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-slate-900/15 hover:bg-indigo-700">Open Schools</button>
                    <button onClick={() => navigate("uploads")} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700">Go to Uploads</button>
                  </div>
                </div>
              </div>
            )}
          </main>

          <footer className="mt-10 border-t border-slate-800 bg-slate-950 text-slate-300">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-black text-white shadow-lg shadow-black/20">LR</div>
                <div>
                  <div className="text-sm font-bold text-white">LR Portal Monitoring System</div>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400">Transforming school roster and utilization records into reliable information for better monitoring and timely decisions.</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:items-end">
                <div className="text-[11px] text-slate-400">Designed and developed by <span className="font-semibold text-slate-200">Broadmaker</span></div>
                <div className="flex flex-wrap gap-2">
                  <a href="https://github.com/Broadmaker" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-indigo-400/50 hover:bg-white/10 hover:text-white"><GithubIcon className="size-4" /> GitHub profile</a>
                  <a href="https://broadmaker.github.io/porfolio/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-indigo-400/50 hover:bg-white/10 hover:text-white">Portfolio <ExternalLinkIcon className="size-3.5" /></a>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 px-5 py-3 text-center text-[10px] text-slate-500">© {new Date().getFullYear()} LR Portal Monitoring System · Data to information, information to insight.</div>
          </footer>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState<"checking" | "authenticated" | "unauthenticated">("checking")
  const [user, setUser] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const response = await fetch("/api/auth/session", { headers: { accept: "application/json" } })
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && data.authenticated) {
          setUser(typeof data.user === "string" ? data.user : "")
          setAuth("authenticated")
        } else {
          setAuth("unauthenticated")
        }
      } catch {
        if (!cancelled) setAuth("unauthenticated")
      }
    }
    void check()
    return () => { cancelled = true }
  }, [])

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } catch {}
    setUser(null)
    setAuth("unauthenticated")
  }

  if (auth === "checking") {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center px-4">
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <div className="size-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 grid place-items-center text-white font-black text-base shadow-lg shadow-indigo-600/20 animate-pulse">LR</div>
          <div><div className="text-sm font-bold text-slate-900">Loading LR Portal</div><div className="text-[11px] text-slate-500">Preparing your workspace…</div></div>
        </div>
      </div>
    )
  }

  if (auth === "unauthenticated" || !user) {
    return <Login onSuccess={(name) => { setUser(name); setAuth("authenticated") }} />
  }

  return <AppShell user={user} onLogout={() => void logout()} />
}
