import { useState, type FormEvent } from "react"
import { AlertIcon } from "./icons"

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 justify-center mb-6">
          <div className="size-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 grid place-items-center text-white font-black text-base shadow-lg shadow-indigo-600/20">LR</div>
          <div className="leading-tight">
            <div className="font-bold tracking-tight text-slate-900 text-lg">LEARNING RESOURCE PORTAL</div>
            <div className="text-[11px] font-semibold tracking-[0.16em] uppercase text-slate-600">Monthly Visual Report</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[24px] shadow-xl shadow-slate-900/5 p-6 sm:p-7">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Enter the access credentials to open the monitoring dashboard.</p>

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
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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
                  className="w-full px-3.5 pr-20 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-500">Private access • Session lasts 7 days</p>
      </div>
    </div>
  )
}
