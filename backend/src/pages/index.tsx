/**
 * RoomShift landing — a STATIC page (top level of src/pages/: no DeepSpace providers, no auth
 * fetch, no records WebSocket; prerendered to HTML at build).
 *
 * This DeepSpace app is the game SERVER (POST /api/game, one Durable Object per room). Players
 * use the one canonical game, the frontend/ PWA at PLAY_URL; this page only points there.
 */

import { Seo } from '../components/Seo'
import { PLAY_URL } from '../constants'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <main
        data-testid="static-landing"
        className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0f1f17] px-6 py-12 text-center text-[#d8e8c8]"
      >
        <p className="text-sm uppercase tracking-[0.3em] text-[#8fbf94]">RoomShift</p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-[#ffb23f] sm:text-5xl">Blackout Protocol</h1>
        <p className="max-w-md text-[#b9d6ba]">
          Facility 04 has lost power. Your team shares secret clues, arranges real objects on the table, boots the comms
          terminal and opens the blast door together, on your phones, in your room.
        </p>
        <a
          href={PLAY_URL}
          className="inline-flex min-h-12 items-center gap-2 bg-[#ffb23f] px-6 py-3 text-base font-semibold text-[#0f1f17] hover:opacity-90"
        >
          Play RoomShift
        </a>
        <p className="max-w-md text-xs text-[#8fbf94]">
          This address runs the game server. Open the game on each phone at{' '}
          <a className="underline" href={PLAY_URL}>
            {PLAY_URL.replace('https://', '')}
          </a>{' '}
          and join with the room code.
        </p>
      </main>
    </>
  )
}
