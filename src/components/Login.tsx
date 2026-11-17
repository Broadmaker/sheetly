import { useState, type FormEvent } from "react"
import { AlertIcon, ChartIcon, SchoolIcon, ShieldIcon, UsersIcon } from "./icons"

interface LoginProps {
  onSuccess: (user: string) => void
}

export default function Login({ onSuccess }: LoginProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? `Sign in failed (${response.status})`)
      onSuccess(typeof data.user === "string" ? data.user : username)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1180px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-sky-500/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-black shadow-lg shadow-black/20">LR</div><div><div className="font-black tracking-tight">LR Portal</div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">School Monitoring</div></div></div>
            <h1 className="mt-16 max-w-lg text-4xl font-black leading-tight tracking-tight">Reliable school data.<br /><span className="text-indigo-300">Clearer decisions.</span></h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-indigo-100">A focused workspace for utilization reporting, school rosters, member quality, and period-to-period monitoring.</p>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            {[{ label: "School directory", icon: <SchoolIcon className="size-5" /> }, { label: "Roster monitoring", icon: <UsersIcon className="size-5" /> }, { label: "Utilization insights", icon: <ChartIcon className="size-5" /> }].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"><div className="text-indigo-300">{item.icon}</div><div className="mt-3 text-xs font-semibold text-white">{item.label}</div></div>)}
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 lg:hidden"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-black text-white shadow-lg shadow-indigo-600/20">LR</div><div><div className="font-black tracking-tight text-slate-950">LR Portal</div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">School Monitoring</div></div></div></div>
            <div className="mb-6 grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><ShieldIcon className="size-5" /></div>
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">Sign in with your authorized workspace credentials.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-username" className="block text-xs font-bold uppercase tracking-wide text-slate-700">Username</label>
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-bold uppercase tracking-wide text-slate-700">Password</label>
              <div className="relative mt-1.5">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 pr-20 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-start gap-2" role="alert">
                <AlertIcon className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full rounded-xl bg-slate-950 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/15 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
            <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-400"><ShieldIcon className="size-3.5" /> Private workspace · Session lasts 7 days</div>
          </div>
        </section>
      </div>
    </div>
  )
}
