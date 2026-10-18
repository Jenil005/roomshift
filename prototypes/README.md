# Prototypes (not used by the game)

Early experiments kept for history and credit. Nothing in the build, the tests or the published site imports these files. They were moved here from the repository root during integration (git history follows them with `git log --follow`).

| Folder | Author | What it is | Where the idea lives now |
|---|---|---|---|
| `mediapipe-web/` | nanoangstromm | Standalone MediaPipe camera loop, crosshair scan and HTML page; Puzzle 1 line/order check in plain JS (`Puzzle1JS.js`, `CompactPuzzle1JS.js`) | `ar/detect/mediapipeDetector.ts` (MediaPipe Tasks Vision adapter, opt-in with `?detector=mediapipe`) and `ar/physicalOrder.ts`; the server re-checks the order in `backend/` |
| `unity/` | nanoangstromm | Unity AR Foundation scripts: automatic and manual object scanners, dynamic bounding box | Not ported. The game is a browser PWA; the manual scanner idea became the game's manual fallback |

To try a web prototype, serve this folder over HTTPS (camera access needs a secure context). The Unity scripts need a Unity project with AR Foundation; there is none in this repository.
