import { getSession, type AuthEnv } from "./api/_lib/session"

type Env = AuthEnv

export const onRequest: PagesFunction<Env> = async (context) => {
  const { pathname } = new URL(context.request.url)

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    const session = await getSession(context.env, context.request)
    if (!session) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }
  }

  return context.next()
}
