/** Room codes, player ids and player tokens. Uses Web Crypto (Workers and Node 20+). */

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@shared/constants'

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)

function randomIndex(max: number): number {
  // Rejection sampling keeps the distribution uniform.
  const limit = 256 - (256 % max)
  const buf = new Uint8Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

export function newRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomIndex(ROOM_CODE_ALPHABET.length)]
  return code
}

/** Uppercases and validates a user-typed code. Returns null when it cannot be a room code. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return CODE_PATTERN.test(code) ? code : null
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function newPlayerId(): string {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return `p_${base64url(bytes)}`
}

export function newPlayerToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/** Only the SHA-256 of a token is stored; the raw token never reaches the game room. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return base64url(new Uint8Array(digest))
}
