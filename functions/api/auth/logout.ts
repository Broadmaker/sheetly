import { clearSessionCookie, type AuthEnv } from "../_lib/session"

type Env = AuthEnv

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(request), "Cache-Control": "no-store" } },
  )
}
