interface Env {
  DB: D1Database
  UPLOADS: R2Bucket
}

interface UploadRow {
  id: string
  original_filename: string
  r2_key: string
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

function safeFilename(name: string): string {
  return name.replace(/["\\\r\n]+/g, "_") || "upload"
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = String(params.id ?? "").trim()
  if (!id) return jsonError("Upload id is required")

  const upload = await env.DB.prepare(
    "SELECT id, original_filename, r2_key FROM uploads WHERE id = ?",
  )
    .bind(id)
    .first<UploadRow>()

  if (!upload) return jsonError("Upload not found", 404)

  const object = await env.UPLOADS.get(upload.r2_key)
  if (!object) return jsonError("Stored file not found", 404)

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeFilename(upload.original_filename)}"`,
      "Cache-Control": "no-store",
    },
  })
}
