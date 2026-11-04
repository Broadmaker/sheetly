interface Env {
  BASIC_AUTH_USER?: string
  BASIC_AUTH_PASSWORD?: string
}

function unauthorized(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Sheetly", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  })
}

function misconfigured(): Response {
  return new Response("Authentication is not configured. Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD.", {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  })
}

async function digest(value: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return new Uint8Array(hash)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index]
  }
  return difference === 0
}

function parseCredentials(header: string | null): string | null {
  if (!header || !header.startsWith("Basic ")) return null
  try {
    const binary = atob(header.slice(6).trim())
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const user = context.env.BASIC_AUTH_USER
  const password = context.env.BASIC_AUTH_PASSWORD
  if (!user || !password) return misconfigured()

  const provided = parseCredentials(context.request.headers.get("Authorization"))
  if (!provided) return unauthorized()

  const [providedHash, expectedHash] = await Promise.all([digest(provided), digest(`${user}:${password}`)])
  if (!constantTimeEqual(providedHash, expectedHash)) return unauthorized()

  return context.next()
}
