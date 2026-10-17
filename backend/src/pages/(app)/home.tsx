/**
 * /home — the signed-in area of the DeepSpace app (operators only). RoomShift's players never
 * need it: the game is the frontend/ PWA at PLAY_URL, and it talks to POST /api/game. This page
 * says so and links there, instead of hosting a second, competing game UI.
 */

import { useAuthProfileReady } from 'deepspace'
import { PLAY_URL } from '../../constants'

export default function HomePage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="text-2xl font-semibold">RoomShift game server</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This DeepSpace app hosts the authoritative game API (<code>POST /api/game</code>) and one room per Durable
        Object. Players do not sign in here: they play in the RoomShift app.
      </p>
      <a
        href={PLAY_URL}
        className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Open RoomShift
      </a>
      {isSignedIn && user && <p className="text-sm text-muted-foreground">Signed in as {user.name ?? user.email}</p>}
    </div>
  )
}
