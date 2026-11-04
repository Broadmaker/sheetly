export interface AuthEnv {
  BASIC_AUTH_USER?: string
  BASIC_AUTH_PASSWORD?: string
  SESSION_SECRET?: string
}

export interface Session {
  sub: string
  exp: number
}

export const SESSION_COOKIE = "sheetly_session"
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index]
  }
  return difference === 0
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return base64UrlEncode(new Uint8Array(signature))
}

function signingSecret(env: AuthEnv): string | null {
  return env.SESSION_SECRET || env.BASIC_AUTH_PASSWORD || null
}

function cookieSecureSuffix(request: Request): string {
  return new URL(request.url).protocol === "https:" ? "; Secure" : ""
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim()
    }
  }
  return null
}

export async function verifyCredentials(env: AuthEnv, username: string, password: string): Promise<boolean> {
  const expectedUser = env.BASIC_AUTH_USER
  const expectedPassword = env.BASIC_AUTH_PASSWORD
  if (!expectedUser || !expectedPassword) return false
  const [providedHash, expectedHash] = await Promise.all([
    digest(`${username}:${password}`),
    digest(`${expectedUser}:${expectedPassword}`),
  ])
  return constantTimeEqual(providedHash, expectedHash)
}

export async function createSessionCookie(
  env: AuthEnv,
  username: string,
  request: Request,
): Promise<string | null> {
  const secret = signingSecret(env)
  if (!secret) return null
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({ sub: username, exp })))
  const signature = await sign(payload, secret)
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${cookieSecureSuffix(request)}`
}

export function clearSessionCookie(request: Request): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSecureSuffix(request)}`
}

export async function getSession(env: AuthEnv, request: Request): Promise<Session | null> {
  const secret = signingSecret(env)
  const expectedUser = env.BASIC_AUTH_USER
  if (!secret || !expectedUser) return null

  const raw = readCookie(request, SESSION_COOKIE)
  if (!raw) return null

  const parts = raw.split(".")
  if (parts.length !== 2) return null
  const [payload, signature] = parts

  try {
    const expectedSignature = await sign(payload, secret)
    if (!constantTimeEqual(base64UrlDecode(signature), base64UrlDecode(expectedSignature))) return null

    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as Partial<Session>
    if (typeof decoded.sub !== "string" || typeof decoded.exp !== "number") return null
    if (decoded.sub !== expectedUser) return null
    if (decoded.exp * 1000 <= Date.now()) return null

    return { sub: decoded.sub, exp: decoded.exp }
  } catch {
    return null
  }
}
