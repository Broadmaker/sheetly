interface Env {
  DB: D1Database
  UPLOADS: R2Bucket
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>()

    return Response.json({
      status: "ok",
      database: result?.ok === 1 ? "connected" : "unavailable",
      storage: env.UPLOADS ? "bound" : "missing",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
