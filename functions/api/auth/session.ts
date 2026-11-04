import { getSession, type AuthEnv } from "../_lib/session"

type Env = AuthEnv

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getSession(env, request)
  if (!session) {
    return Response.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } })
  }
  return Response.json(
    { authenticated: true, user: session.sub, expiresAt: session.exp * 1000 },
    { headers: { "Cache-Control": "no-store" } },
  )
}
