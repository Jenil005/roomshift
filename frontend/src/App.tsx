import { useEffect, useState } from 'react'
import './App.css'

type Player = { id: string; name: string; host?: boolean; ready: boolean; color: string }
type Phase = 'home' | 'lobby' | 'briefing' | 'order' | 'sync' | 'override' | 'victory' | 'reconnect'
const initialPlayers: Player[] = [
  { id: 'you', name: 'NOVA', host: true, ready: true, color: 'cyan' },
  { id: 'echo', name: 'ECHO-7', ready: true, color: 'purple' },
  { id: 'vex', name: 'VEX', ready: false, color: 'red' },
]
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const makeCode = () => Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')

function App() {
  const [phase, setPhase] = useState<Phase>('home')
  const [roomCode, setRoomCode] = useState('')
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [cameraMessage, setCameraMessage] = useState('')
  const [ordered, setOrdered] = useState(false)
  const [syncA, setSyncA] = useState(false)
  const [syncB, setSyncB] = useState(false)
  const [activated, setActivated] = useState(false)
  const [fragment, setFragment] = useState('')

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent) }
    const appInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', appInstalled)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', appInstalled)
    }
  }, [])

  const createRoom = () => {
    if (!online) { setError('You are offline. Reconnect before creating a multiplayer room.'); return }
    setRoomCode(makeCode()); setPlayers(initialPlayers); setError(''); setPhase('lobby')
  }
  const joinRoom = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanCode = joinCode.trim().toUpperCase()
    if (!online) { setError('You are offline. Reconnect to join a multiplayer room.'); return }
    if (cleanName.length < 2) { setError('Callsign must be at least 2 characters.'); return }
    if (!/^[A-Z0-9]{5}$/.test(cleanCode)) { setError('Enter a valid 5-character room code.'); return }
    setRoomCode(cleanCode)
    setPlayers([{ id: 'you', name: cleanName.toUpperCase(), ready: false, color: 'cyan' }, ...initialPlayers.slice(0, 2).map((p) => ({ ...p, id: `mock-${p.id}`, host: false }))])
    setError(''); setPhase('lobby')
  }
  const toggleReady = () => setPlayers((current) => current.map((p) => p.id === 'you' ? { ...p, ready: !p.ready } : p))
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(roomCode); setError('Room code copied.') }
    catch { setError('Select the room code to copy it.') }
  }
  const startMission = () => { setFragment(''); setPhase('briefing') }
  const continueOffline = () => setPhase('reconnect')
  const cameraHelp = async () => {
    setCameraMessage('')
    if (!navigator.mediaDevices?.getUserMedia) { setCameraMessage('Camera scanning is unavailable in this browser. Continue with the simulated marker check.'); return }
    if (!window.isSecureContext) { setCameraMessage('Camera access requires HTTPS in deployment. Localhost is supported for development.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      stream.getTracks().forEach((track) => track.stop())
      setCameraMessage('Camera permission granted. Marker scanning is simulated in this demo.')
    } catch {
      setCameraMessage('Camera permission was denied or unavailable. You can continue using the simulated marker check.')
    }
  }
  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const result = await installPrompt.userChoice
    if (result.outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }
  const isHost = players.find((player) => player.id === 'you')?.host ?? false

  return <main className="shell">
    <div className="scanlines" aria-hidden="true" />
    <header className="topbar">
      <button className="brand" type="button" onClick={() => setPhase('home')} aria-label="RoomShift home"><span className="brand-mark"><span /></span><span>ROOM<span className="brand-light">SHIFT</span><small>BLACKOUT PROTOCOL</small></span></button>
      <div className={`top-status ${online ? '' : 'offline-status'}`}><i /> {online ? 'SYSTEMS ONLINE' : 'CONNECTION LOST'} <span className="top-divider">/</span> SECTOR 09</div>
      {installPrompt && !installed && <button className="install-button" type="button" onClick={() => void install()}>INSTALL APP</button>}
    </header>
    {!online && <div className="offline-banner" role="status"><strong>OFFLINE</strong><span>App shell available. Multiplayer actions need a connection and server sync.</span><button type="button" onClick={continueOffline}>RECONNECT STATUS</button></div>}
    {installed && <p className="install-status" role="status">ROOMSHIFT INSTALLED</p>}

    {phase === 'home' && <section className="landing page-wrap">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> INCOMING TRANSMISSION <span className="eyebrow-id">[ RS-09.442 ]</span></div><h1>THE SIGNAL<br />IS <em>FADING.</em></h1><p className="hero-description">The station went dark 6 hours ago.<br />Your crew is the only one still responding.</p><div className="hero-buttons"><button className="primary-button" onClick={createRoom} type="button">CREATE DEMO ROOM <span>↗</span></button><button className="secondary-button" onClick={() => document.getElementById('join-name')?.focus()} type="button">JOIN ROOM <span>＋</span></button></div><div className="connection-note"><span className="signal-bars"><i /><i /><i /><i /></span> DEMO MODE · GAME STATE IS NOT SERVER CONNECTED</div></div>
      <div className="station-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="station-core"><div className="core-ring"><div className="core-inner"><span className="core-cross">＋</span><span className="core-code">RS-09</span></div></div></div><div className="art-label label-top"><span>01 / DEEP ORBIT</span><i /></div><div className="art-label label-bottom"><i /><span>NO SIGNAL · 06:14:32</span></div><span className="art-coord coord-left">44° 08′ 19″ N<br />12° 44′ 02″ E</span><span className="art-coord coord-right">STATION<br />K-09 / A</span><div className="radar-sweep" /></div>
      <section className="join-panel" aria-label="Join a room"><div className="panel-heading"><span>01</span><h2>JOIN YOUR CREW</h2><i /></div><form className="join-form" onSubmit={joinRoom}><label htmlFor="join-name">CALLSIGN</label><input id="join-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ENTER YOUR NAME" maxLength={16} autoComplete="nickname" /><label htmlFor="join-code">ROOM CODE</label><input id="join-code" className="code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} placeholder="— — — — —" maxLength={5} />{error && <p className="form-error" role="alert">{error}</p>}<button className="form-submit" type="submit">CONNECT TO ROOM <span>→</span></button></form><div className="panel-footer"><span>SECURE CHANNEL</span><span><i /> DEMO PREVIEW</span></div></section>
      <div className="landing-bottom"><span>FIELD MANUAL <b>V.2.04.19</b></span><span>SWAMPHACKS XII <b>·</b> BLACKOUT PROTOCOL</span><span>{installed ? 'APP INSTALLED' : 'INSTALL WHEN SUPPORTED'}</span></div>
    </section>}

    {phase === 'lobby' && <section className="lobby page-wrap"><div className="section-kicker"><span className="eyebrow-line" /> PRE-MISSION ASSEMBLY <span className="eyebrow-id">[ LOBBY / DEMO ]</span></div><div className="lobby-heading"><div><h1>CREW <em>MANIFEST</em></h1><p>Demo crew ready states are simulated.</p></div><div className="room-code"><span>DEMO ROOM CODE</span><strong>{roomCode}</strong><button type="button" onClick={() => void copyCode()}>COPY ↗</button></div></div><div className="lobby-grid"><section className="roster-panel"><div className="roster-head"><span>ACTIVE OPERATIVES · SIMULATED</span><span>{String(players.length).padStart(2, '0')} / 04</span></div><div className="player-list">{players.map((p, i) => <article className={`player-card ${p.color}`} key={p.id}><div className="player-number">0{i + 1}</div><div className="avatar"><span>{p.name.slice(0, 1)}</span><i /></div><div className="player-info"><strong>{p.name}{p.id === 'you' && <small>YOU</small>}</strong><span>FIELD OPERATIVE · DEMO</span></div><div className="player-state">{p.host && <span className="host-label">✦ HOST</span>}<span className={p.ready ? 'ready' : 'not-ready'}><i /> {p.ready ? 'READY' : 'STANDBY'}</span></div></article>)}</div><button className="invite-slot" type="button" onClick={() => void copyCode()}><span>＋</span><div><strong>INVITE AN OPERATIVE</strong><small>SHARE THE DEMO ROOM CODE</small></div><b>↗</b></button><button className="ready-toggle inline-ready" onClick={toggleReady} type="button">{players.find((p) => p.id === 'you')?.ready ? 'MARK NOT READY' : 'MARK READY'}</button></section><aside className="mission-side"><div className="side-title"><span>MISSION PARAMETERS</span><b>● DEMO</b></div><div className="mission-preview"><div className="mission-image"><div className="image-grid" /><span className="sector-tag">SECTOR 09 — KESTREL</span><span className="warning-tag">⚠ SIGNAL LOST</span><div className="image-target">⊕</div><span className="image-readout">LAT 44.08 / LON 12.44<br />ATMOSPHERE: UNSTABLE</span></div><div className="preview-copy"><span>OPERATION 001</span><h2>BLACKOUT<br />PROTOCOL</h2><p>Investigate the silence. Find the source.<br />Get your crew out alive.</p></div></div><div className="ready-check"><div><span>CREW READINESS</span><strong>{players.filter((p) => p.ready).length} / {players.length}</strong></div><div className="readiness-track"><span style={{ width: `${players.filter((p) => p.ready).length / players.length * 100}%` }} /></div><small>SIMULATED PLAYER STATES</small></div><button className="start-button" type="button" disabled={!isHost || players.length < 2 || !online} onClick={startMission}>START DEMO MISSION <span>→</span></button><p className="start-hint">{!online ? 'RECONNECT TO START MULTIPLAYER' : 'DEMO ONLY · BACKEND DOES NOT AUTHORIZE STATE'}</p></aside></div><div className="lobby-foot"><button type="button" onClick={() => setPhase('home')}>← LEAVE ROOM</button><span>ALL OTHER PLAYERS AND READY STATES ARE SIMULATED</span><span>ROOMSHIFT · 2089</span></div></section>}

    {phase === 'briefing' && <section className="mission-screen page-wrap"><div className="section-kicker"><span className="eyebrow-line" /> TRANSMISSION DECRYPTED <span className="eyebrow-id">[ OP-001 ]</span></div><div className="briefing-card"><div className="briefing-art"><div className="briefing-orbit" /><span>KESTREL STATION / SECTOR 09</span><strong>09</strong><i>NO SIGNAL</i></div><div className="briefing-copy"><span className="red-text">PRIORITY: CRITICAL</span><h1>BLACKOUT<br /><em>PROTOCOL</em></h1><div className="briefing-rule" /><h2>MISSION OBJECTIVE</h2><p>Restore the station’s power grid. Coordinate with your crew to repair the relay, synchronize the manual power couplings, and disable the lockdown.</p><div className="private-clue"><span>YOUR PRIVATE CLUE · DEMO</span><strong>BOOK → CUP → KEYS</strong><small>Share your clue with the crew. Every operative sees a different fragment in real multiplayer.</small></div><div className="briefing-meta"><span>CREW <b>{players.length} OPERATIVES</b></span><span>ROOM <b>{roomCode}</b></span><span>MODE <b>SIMULATED</b></span></div><button className="primary-button" type="button" onClick={() => setPhase('order')}>BEGIN PUZZLE 01 <span>→</span></button></div></div><p className="mock-notice">DEMO PLAYTHROUGH · MULTIPLAYER AND PHYSICAL MARKER VERIFICATION ARE SIMULATED</p></section>}

    {phase === 'order' && <GamePanel step="PUZZLE 01 / 03" title="RESTORE THE OBJECT ORDER" subtitle="Arrange the physical objects according to your crew’s clues. The demo uses a tap-to-order simulation; nothing is being scanned or verified by a server."><div className="object-order">{['BOOK', 'CUP', 'KEYS'].map((object, i) => <div className="object-card" key={object}><span>0{i + 1}</span><strong>{object}</strong><small>MARKER {i + 1}</small></div>)}</div><p className="camera-explain">Camera access is only needed to scan physical markers. You can play this demo without a camera.</p><button className="secondary-button" type="button" onClick={() => void cameraHelp()}>CHECK CAMERA PERMISSION</button>{cameraMessage && <p className="camera-message" role="status">{cameraMessage}</p>}<button className="primary-button game-action" type="button" onClick={() => setOrdered(true)}>{ordered ? 'ORDER VERIFIED · DEMO' : 'SUBMIT OBJECT ORDER'} <span>→</span></button>{ordered && <button className="secondary-button game-action" type="button" onClick={() => setPhase('sync')}>CONTINUE TO PUZZLE 02 →</button>}</GamePanel>}

    {phase === 'sync' && <GamePanel step="PUZZLE 02 / 03" title="SYNCHRONIZE THE RELAY" subtitle="Two operatives activate their assigned couplings together while a third calls the timing. All player actions are simulated locally in this demo."><div className="sync-actions"><button className={`sync-pad ${syncA ? 'complete' : ''}`} type="button" onClick={() => setSyncA(!syncA)}><span>OPERATIVE A</span><strong>{syncA ? 'COUPLING HELD' : 'HOLD COUPLING A'}</strong></button><button className={`sync-pad ${syncB ? 'complete' : ''}`} type="button" onClick={() => setSyncB(!syncB)}><span>OPERATIVE B</span><strong>{syncB ? 'COUPLING HELD' : 'HOLD COUPLING B'}</strong></button></div><p className="sync-status" role="status">{syncA && syncB ? 'WINDOW ALIGNED · DEMO VERIFIED' : 'WAITING FOR BOTH OPERATIVES'}</p>{syncA && syncB && <button className="primary-button game-action" type="button" onClick={() => setPhase('override')}>CONTINUE TO FINAL OVERRIDE →</button>}</GamePanel>}

    {phase === 'override' && <GamePanel step="FINAL OVERRIDE / 03" title="DISABLE THE LOCKDOWN" subtitle="Combine both fragments, then activate the override together. Server verification is not connected; this final sequence is a local demo simulation."><div className="code-fragments"><div><span>YOUR FRAGMENT · DEMO</span><strong>7K</strong></div><div><span>CREW FRAGMENT · DEMO</span><strong>2Q</strong></div></div><label className="override-label" htmlFor="override-code">COMBINED OVERRIDE CODE</label><input className="override-input" id="override-code" value={fragment} onChange={(event) => setFragment(event.target.value.toUpperCase().slice(0, 4))} placeholder="_ _ _ _" maxLength={4} />{fragment.length === 4 && fragment !== '7K2Q' && <p className="form-error" role="alert">Code mismatch. Combine both crew fragments.</p>}<button className="primary-button game-action" type="button" disabled={fragment !== '7K2Q'} onClick={() => setActivated(true)}>{activated ? 'ACTIVATING…' : 'HOLD TO ACTIVATE TOGETHER'} <span>→</span></button>{activated && <button className="secondary-button game-action" type="button" onClick={() => setPhase('victory')}>COMPLETE DEMO MISSION →</button>}</GamePanel>}

    {phase === 'victory' && <section className="victory-screen page-wrap"><div className="victory-mark">✓</div><div className="eyebrow"><span className="eyebrow-line" /> FACILITY STATUS: STABLE</div><h1>POWER<br /><em>RESTORED.</em></h1><div className="victory-results"><strong>LOCKDOWN DISABLED</strong><strong>MISSION COMPLETE</strong></div><p>Your crew brought Kestrel Station back online.<br />Cooperative actions in this run were simulated for the demo.</p><button className="primary-button" type="button" onClick={() => { setOrdered(false); setSyncA(false); setSyncB(false); setActivated(false); setPhase('home') }}>RETURN TO HOME ↗</button></section>}

    {phase === 'reconnect' && <section className="reconnect-screen page-wrap"><div className="section-kicker"><span className="eyebrow-line" /> NETWORK DIAGNOSTIC</div><h1>{online ? 'CONNECTION<br /><em>RESTORED.</em>' : 'SIGNAL<br /><em>UNAVAILABLE.</em>'}</h1><p>{online ? 'Network access is back. Multiplayer state still requires a fresh backend connection and resynchronization.' : 'The app shell is cached and available. Game progress cannot be verified offline.'}</p><div className="reconnect-actions"><button className="primary-button" type="button" onClick={() => online ? setPhase('home') : window.location.reload()}>{online ? 'RETURN TO HOME' : 'RETRY CONNECTION'}</button><button className="secondary-button" type="button" onClick={() => setPhase('home')}>GO TO DEMO HOME</button></div></section>}
    <footer className="global-footer"><span>ROOMSHIFT // BLACKOUT PROTOCOL</span><span>{online ? 'DEMO SYSTEMS READY' : 'OFFLINE · DEMO UNAVAILABLE'} <i /> <b>V.2.04.19</b></span></footer>
  </main>
}

function GamePanel({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="game-panel page-wrap"><div className="section-kicker"><span className="eyebrow-line" /> {step} <span className="eyebrow-id">[ DEMO MODE ]</span></div><h1>{title}</h1><p className="game-subtitle">{subtitle}</p><div className="game-card">{children}</div></section>
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> }
export default App
