import { describe, expect, it, vi } from 'vitest'
import { buildPrompt, cleanNarration, generateNarration, type NarrationContext } from './gemini'

const ctx: NarrationContext = {
  phase: 'PUZZLE_2',
  teamSize: 3,
  roles: ['engineer', 'analyst', 'scout'],
  systemsOnline: ['breaker'],
  failedAttempts: 2,
}

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('buildPrompt', () => {
  it('describes the moment from public facts only', () => {
    const prompt = buildPrompt(ctx)
    expect(prompt).toContain('comms terminal')
    expect(prompt).toContain('Team size: 3')
    expect(prompt).toContain('failed 2 attempt')
    // The context type has no field for names, clues or solutions, so none can leak.
    expect(Object.keys(ctx).sort()).toEqual(['failedAttempts', 'phase', 'roles', 'systemsOnline', 'teamSize'])
  })
})

describe('cleanNarration', () => {
  it('strips markdown and quotes and collapses whitespace', () => {
    expect(cleanNarration('  **Power** flickers.\n  "Hold on," _operatives_.  ')).toBe('Power flickers. Hold on, operatives.')
  })

  it('caps long output at a sentence boundary and rejects empty output', () => {
    const long = `${'The facility groans. '.repeat(20)}`
    const out = cleanNarration(long)!
    expect(out.length).toBeLessThanOrEqual(240)
    expect(out.endsWith('.')).toBe(true)
    expect(cleanNarration('  ** ')).toBeNull()
  })
})

describe('generateNarration', () => {
  it('calls the Gemini REST API with the key in a header and returns cleaned text', async () => {
    const fetchImpl = reply({
      candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: 'The terminal *hums* awake.' }] } }],
    })
    await expect(generateNarration('test-key', 'gemini-3.5-flash-lite', ctx, fetchImpl)).resolves.toBe('The terminal hums awake.')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    expect(url).not.toContain('test-key')
  })

  it('returns null (fallback stays) on HTTP errors, empty output, or a thrown fetch', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(generateNarration('k', 'm', ctx, reply({ error: 'quota' }, 429))).resolves.toBeNull()
    await expect(generateNarration('k', 'm', ctx, reply({ candidates: [] }))).resolves.toBeNull()
    const boom = vi.fn(async () => {
      throw new Error('timeout')
    }) as unknown as typeof fetch
    await expect(generateNarration('k', 'm', ctx, boom)).resolves.toBeNull()
    quiet.mockRestore()
  })
})
