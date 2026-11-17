import { useEffect, useState } from "react"
import { NAV_SECTIONS, type AppView } from "../lib/navigation"
import {
  ChartIcon,
  CompareIcon,
  DataIcon,
  DuplicateIcon,
  GridIcon,
  HistoryIcon,
  LogoutIcon,
  MailIcon,
  SchoolIcon,
  ShieldIcon,
  SearchIcon,
  TrendIcon,
  UploadIcon,
  UsersIcon,
} from "./icons"

interface Props {
  view: AppView
  onNavigate: (view: AppView) => void
  user: string
  onLogout: () => void
}

function iconFor(view: AppView) {
  switch (view) {
    case "overview":
      return <GridIcon className="size-[18px]" />
    case "uploads":
      return <UploadIcon className="size-[18px]" />
    case "directory":
      return <SchoolIcon className="size-[18px]" />
    case "roster":
      return <UsersIcon className="size-[18px]" />
    case "trends":
      return <TrendIcon className="size-[18px]" />
    case "dashboard":
      return <ChartIcon className="size-[18px]" />
    case "school":
      return <SchoolIcon className="size-[18px]" />
    case "users":
      return <UsersIcon className="size-[18px]" />
    case "comparison":
      return <CompareIcon className="size-[18px]" />
    case "duplicates":
      return <DuplicateIcon className="size-[18px]" />
    case "find":
      return <SearchIcon className="size-[18px]" />
    case "email":
      return <MailIcon className="size-[18px]" />
    case "history":
      return <HistoryIcon className="size-[18px]" />
    case "audit":
      return <ShieldIcon className="size-[18px]" />
    default:
      return <DataIcon className="size-[18px]" />
  }
}

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "justify-center" : "gap-3"}`}>
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow-lg shadow-indigo-950/30">LR</div>
      {!compact && <div className="min-w-0 leading-none">
        <div className={`truncate text-[15px] font-black tracking-tight ${inverse ? "text-white" : "text-slate-900"}`}>LR Portal</div>
        <div className={`mt-1 truncate text-[9px] font-bold uppercase tracking-[0.15em] ${inverse ? "text-indigo-300" : "text-slate-500"}`}>School Monitoring</div>
      </div>}
    </div>
  )
}

export default function AppSidebar({ view, onNavigate, user, onLogout }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sheetly.sidebar.collapsed") === "true" } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem("sheetly.sidebar.collapsed", String(collapsed)) } catch {}
  }, [collapsed])

  return (
    <aside className={`relative hidden h-screen shrink-0 flex-col border-r border-indigo-950 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950 text-white shadow-xl shadow-slate-950/10 transition-[width] duration-300 lg:sticky lg:top-0 lg:flex ${collapsed ? "w-[82px]" : "w-[276px]"}`}>
      <div className={`flex h-[76px] items-center border-b border-white/10 ${collapsed ? "justify-center px-3" : "px-5"}`}>
        <Brand compact={collapsed} inverse />
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-[92px] z-40 grid size-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:border-indigo-300 hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={`size-3.5 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} aria-hidden="true"><path d="m12.5 4.5-5 5.5 5 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      <nav aria-label="Primary navigation" className={`flex-1 space-y-5 overflow-y-auto overflow-x-hidden py-5 ${collapsed ? "px-2.5" : "px-3"}`}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            {collapsed ? <div className="mx-3 mb-2 border-t border-white/10" aria-hidden="true" /> : <div className="px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-300/70">{section.title}</div>}
            <div className={`${collapsed ? "space-y-1" : "mt-1.5 space-y-1"}`}>
              {section.items.map((item) => {
                const active = view === item.view
                const unavailable = item.unavailable === true
                return (
                  <button
                    key={item.view}
                    onClick={() => { if (!unavailable) onNavigate(item.view) }}
                    disabled={unavailable}
                    aria-disabled={unavailable}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? `${item.label} — ${unavailable ? "Temporarily unavailable" : item.hint}` : unavailable ? "This feature is temporarily unavailable" : undefined}
                    className={`relative flex w-full items-center rounded-xl text-left transition focus-visible:ring-2 focus-visible:ring-indigo-400 ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"} ${unavailable ? "cursor-not-allowed opacity-35" : active ? "bg-white text-indigo-950 shadow-lg shadow-black/20" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                  >
                    {active && <span className={`absolute bg-indigo-500 ${collapsed ? "-left-2.5 h-7 w-1 rounded-r-full" : "left-0 h-6 w-1 rounded-r-full"}`} aria-hidden="true" />}
                    <span className={active && !unavailable ? "text-indigo-700" : unavailable ? "text-slate-500" : "text-indigo-200"}>{iconFor(item.view)}</span>
                    {!collapsed && <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{item.label}</span>
                      <span className={`block truncate text-[10px] ${active && !unavailable ? "text-indigo-700/70" : "text-slate-500"}`}>{item.hint}</span>
                    </span>}
                    {unavailable && !collapsed && <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">Off</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className={`flex items-center rounded-xl border border-white/10 bg-white/5 ${collapsed ? "flex-col gap-2 px-1.5 py-2" : "gap-2 px-2 py-2"}`}>
          <div title={collapsed ? user : undefined} className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-500 text-xs font-black uppercase text-white shadow-md shadow-black/20">{user.slice(0, 2) || "LR"}</div>
          {!collapsed && <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-white">{user}</div>
            <div className="text-[10px] font-medium text-slate-400">Signed in</div>
          </div>}
          <button onClick={onLogout} title="Sign out" aria-label="Sign out" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-400">
            <LogoutIcon className="size-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  )
}

export function MobileNav({ view, onNavigate }: { view: AppView; onNavigate: (view: AppView) => void }) {
  return (
    <div role="navigation" aria-label="Primary navigation" className="lg:hidden no-print overflow-x-auto border-b border-slate-200 bg-white">
      <div className="flex items-center gap-1.5 px-3 py-2 min-w-max">
        {NAV_SECTIONS.flatMap((section) => section.items).map((item) => {
          const active = view === item.view
          const unavailable = item.unavailable === true
          return (
            <button
              key={item.view}
              onClick={() => { if (!unavailable) onNavigate(item.view) }}
              disabled={unavailable}
              aria-disabled={unavailable}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${unavailable ? "cursor-not-allowed opacity-40" : active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
