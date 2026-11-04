import { createSessionCookie, verifyCredentials, type AuthEnv } from "../_lib/session"

type Env = AuthEnv

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { username?: string; password?: string } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }

  const username = String(body.username ?? "").trim()
  const password = String(body.password ?? "")
  if (!username || !password) {
    return Response.json({ error: "Username and password are required." }, { status: 400 })
  }

  if (!(await verifyCredentials(env, username, password))) {
    return Response.json({ error: "Invalid username or password." }, { status: 401 })
  }

  const cookie = await createSessionCookie(env, username, request)
  if (!cookie) {
    return Response.json({ error: "Authentication is not configured." }, { status: 503 })
  }

  return Response.json(
    { ok: true, user: username },
    { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
  )
}
