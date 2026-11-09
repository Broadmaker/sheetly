import { NAV_SECTIONS, type AppView } from "../lib/navigation"
import {
  ChartIcon,
  CompareIcon,
  DataIcon,
  DuplicateIcon,
  GridIcon,
  LogoutIcon,
  SchoolIcon,
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
    default:
      return <DataIcon className="size-[18px]" />
  }
}

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 grid place-items-center text-white font-black text-sm shadow-lg shadow-indigo-600/20">LR</div>
      <div className="leading-none">
        <div className="font-bold tracking-tight text-slate-900 text-[15px]">LEARNING RESOURCE PORTAL</div>
        <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-slate-500 mt-1">Monthly Visual Report</div>
      </div>
    </div>
  )
}

export default function AppSidebar({ view, onNavigate, user, onLogout }: Props) {
  return (
    <aside className="hidden lg:flex w-[268px] shrink-0 flex-col sticky top-0 h-screen bg-white border-r border-slate-200">
      <div className="h-[68px] px-5 flex items-center border-b border-slate-200">
        <Brand />
      </div>

      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-3 text-[10px] font-bold tracking-[0.18em] uppercase text-slate-400">{section.title}</div>
            <div className="mt-1.5 space-y-1">
              {section.items.map((item) => {
                const active = view === item.view
                return (
                  <button
                    key={item.view}
                    onClick={() => onNavigate(item.view)}
                    aria-current={active ? "page" : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <span className={active ? "text-white" : "text-slate-500"}>{iconFor(item.view)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate">{item.label}</span>
                      <span className={`block text-[11px] truncate ${active ? "text-slate-300" : "text-slate-500"}`}>{item.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-2 rounded-xl px-2 py-2">
          <div className="size-9 rounded-full bg-slate-900 text-white grid place-items-center text-xs font-bold uppercase shrink-0">{user.slice(0, 2) || "LR"}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-900 truncate">{user}</div>
            <div className="text-[10px] font-medium text-slate-500">Signed in</div>
          </div>
          <button onClick={onLogout} title="Sign out" aria-label="Sign out" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-500">
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
          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
