# RoomShift iPhone final acceptance (Phase 10)

> **Status: NOT DEVICE-VERIFIED.**
> No real iPhone has run this branch yet. Every result below is blank on purpose. Only a person holding a real iPhone may fill one in, and the status above changes only when every **required** row has an observed result and every failure has been retested.

Desktop evidence (two-browser missions, XR8 contract double, real detector models on photos) is in `docs/INTEGRATION_TEST_RESULTS.md`. It does not replace this test.

## How to fill this in

- Write what you **saw**, not what should happen. "Breaker lit about 1 s after Jordan's scan verified" beats "works".
- Result column: `PASS`, `FAIL`, `PARTIAL` or `NOT RUN` (with reason). Leave nothing blank once you start a section.
- Every `FAIL` or `PARTIAL` gets a row in **Failures and retests** (section 13) with a retest result.
- Never put screenshots of the `?debug` overlay that show a room you still care about in public places. The overlay never shows tokens or clues, but room codes are joinable.
- Safety: walk only in a clear, open area. The facility's virtual walls are **not** physical obstacles and do not protect you from real ones.

## Tools for testers

| Tool | How | What it shows |
|---|---|---|
| Debug overlay | add `?debug` to the game URL, tap **DEBUG ▸** (top left) | build SHA; runtime versions (XR Engine, MediaPipe, COCO-SSD, three); live/demo mode and API host; connection; room code, version, phase, players online; lit systems; last server event; camera owner (`AI scanner live`, `QR scanner live`, `XR engine …`, `released`); detector name and ms per frame; AR tracking status / reason and frame time; latest server error and camera/AR error. Never tokens, clues or camera images. Off unless `?debug` is in the URL. |
| Device diagnostics | `/diagnostics.html` | secure context, WebGL/WebGL2, WebAssembly + SIMD, camera API, motion permission API, device memory, pixel ratio, packaged runtime versions, user agent. Buttons: Load MediaPipe, Load COCO-SSD (load time), Detect on one camera frame (one frame, raw labels and scores, camera then closes), Release models. |
| Detector choice | `?detector=coco` (default), `?detector=mediapipe`, `?detector=auto` (MediaPipe, then COCO-SSD) | which model the Puzzle 1 scanner uses |
| QR tags | `/markers/book.svg`, `/markers/cup.svg`, `/markers/keys.svg` | printable tags. **KEYS is identified only by its QR tag**: neither model has a keys class |
| Licenses | `/licenses.html` | third-party credits, including the Niantic XR Engine |

Combine flags with `&`, for example `…/?debug&detector=mediapipe`.

## 1. Test setup

| Field | Phone A | Phone B |
|---|---|---|
| Tester name / role | | |
| iPhone model | | |
| iOS version (Settings → General → About) | | |
| Safari version | | |
| Low Power Mode on? | | |
| Battery % at start | | |
| Network (Wi-Fi / 5G / LTE) | | |

| Field | Value |
|---|---|
| Date and time (with time zone) | |
| HTTPS URL tested (preview or production? write which) | |
| Build SHA from the debug overlay | |
| Matches commit on `feature/full-integration`? | |
| Backend API host from the debug overlay | |
| Room: lighting (bright / normal / dim), floor type, open floor area in metres | |
| Objects used for BOOK / CUP (describe) | |
| KEYS: QR tag printed on paper? size? | |

## 2. Diagnostics page (`/diagnostics.html`), each phone

| # | Check | Expected | Phone A observed | Phone B observed | Result |
|---|---|---|---|---|---|
| 2.1 | Environment block | secure context true, WebGL true, WebAssembly true, camera API true, motion permission API true, runtime versions listed (not "missing") | | | |
| 2.2 | Load COCO-SSD | loads, time in ms shown | load time: | load time: | |
| 2.3 | Load MediaPipe | loads (WASM + model from this site), time shown, or a clear error | load time / error: | load time / error: | |
| 2.4 | Detect on one camera frame, book + cup in view | camera prompt, one frame, labels include `book` and `cup` with scores; camera indicator turns off afterwards | scores: | scores: | |
| 2.5 | Release models | log confirms release; page stays responsive | | | |

## 3. Opening the game: Safari and Home Screen

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 3.1 | Open the URL in Safari | Home screen loads; no console-style errors on screen | | |
| 3.2 | iOS install hint | Home shows how to Add to Home Screen | | |
| 3.3 | Add to Home Screen, open from the icon | standalone (no Safari bars), RoomShift icon and name, safe areas respected (notch, home bar) | | |
| 3.4 | Create a room from the installed app, join it from Safari on Phone B | both in the same lobby | | |
| 3.5 | Offline label | turn on Airplane Mode briefly: connection label changes (RECONNECTING / OFFLINE), then recovers when back online | | |

## 4. Permissions: camera and motion

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 4.1 | First **START AR** | Safari asks for motion & orientation access and for the camera (note the order you saw); AR starts after Allow | order seen: | |
| 4.2 | Deny motion | clear message; 3D preview (labelled "3D PREVIEW · NOT AR") still works; no crash | | |
| 4.3 | Deny camera | clear message that names Safari camera permission; preview still works | | |
| 4.4 | Retry after denial (Settings → Safari → Camera / Motion → Allow, or reload) | AR starts on retry; game seat kept | | |
| 4.5 | Puzzle 1 scanner first open | camera prompt only after tapping the scan button, not on screen load | | |
| 4.6 | Deny camera in Puzzle 1 | QR / manual fallback offered honestly; manual report is still judged by the server | | |

## 5. Room-scale AR facility

Open the facility from any mission screen (facility button in the header). Use the debug overlay's tracking line.

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 5.1 | XR engine download and start | "Downloading the AR engine (about 6.5 MB, first time only)…" then rear camera; overlay `camera XR engine …` | time to camera: | |
| 5.2 | Chip | "AR · WORLD TRACKING" only while tracking runs; "3D PREVIEW · NOT AR" otherwise | | |
| 5.3 | Calibrate (type camera height) and place on the floor | reticle on the floor; facility appears where tapped; PLACE / MOVE work | camera height typed: | |
| 5.4 | Real translation / parallax | walk 1–2 m around it: the facility stays put in the room and you see its sides; it does not follow the phone | | |
| 5.5 | Approximate scale | facility footprint looks about the intended size on the real floor (measure with a tape if possible) | measured: | |
| 5.6 | Floor contact | facility base sits on the floor, not floating or sunk (floor height is a manual estimate) | gap or sink in cm: | |
| 5.7 | Drift | mark the facility corner on the real floor, walk a 3 m loop, return: distance between mark and corner | drift in cm: | |
| 5.8 | Relocalization | cover the camera 3 s, uncover: "Tracking limited…" shown, facility hidden, then returns in place (or say where it reappeared) | | |
| 5.9 | Low light | dim the room: tracking status in the overlay, message shown, recovery time when lights return | | |
| 5.10 | Blank floor | point at a plain, featureless floor: limited tracking message, no wild jumps | | |
| 5.11 | Rapid motion | shake / swing the phone quickly: recovery without crash; facility returns in place | | |
| 5.12 | 3D taps | tap a terminal panel in AR: it becomes a boot-order edit the other phone sees | | |
| 5.13 | EXIT AR | camera released; overlay `camera released`; **iOS camera indicator (green dot) turns off** | | |
| 5.14 | Start AR again in the same page | AR restarts, or "RELOAD TO RESTART AR" is offered and reload keeps the seat | | |
| 5.15 | FX setting | toggling FX changes visual load; frame time in overlay at each setting | FX high ms: · low ms: | |

## 6. Puzzle 1 scanner: BOOK, CUP, KEYS

Use the default `?detector=coco` first, then repeat 6.1–6.4 with `?detector=mediapipe`.

| # | Check | Expected | COCO-SSD observed | MediaPipe observed | Result |
|---|---|---|---|---|---|
| 6.1 | Real BOOK recognized | box on the book, label BOOK; confidence (from `/diagnostics.html` if not shown) | conf: | conf: | |
| 6.2 | Real CUP recognized | box on the cup, label CUP | conf: | conf: | |
| 6.3 | KEYS | identified **only via its printed QR tag**; real keys without the tag must **not** count | | | |
| 6.4 | Inference time | overlay `detector … · N ms/frame` after 30 s scanning | ms: | ms: | |
| 6.5 | Overlay alignment | boxes line up with the objects in portrait; also check after rotating | | | |
| 6.6 | Wrong order | shows the wrong order; server does not verify | | | |
| 6.7 | Correct order, held still | verified after the hold (~1.2 s); breaker lights on **both** phones | time to verify: | | |
| 6.8 | Missing / duplicate object | removing one object or showing two cups does not verify | | | |
| 6.9 | QR backup mode | all three tags in order verify through the QR scanner | | | |
| 6.10 | Single camera owner | opening the scanner from inside the facility stops AR first (overlay `camera released` then `AI scanner live`); never two camera streams | | | |
| 6.11 | Leaving the scanner | camera indicator turns off | | | |

## 7. Two-phone gameplay (two real iPhones)

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 7.1 | Create on A, join on B by code and by QR | both in lobby; QR join opens the room | | |
| 7.2 | Ready + host start | INTRO on both; roles shown | | |
| 7.3 | Private clues | each phone shows a different fragment; neither phone shows the other's text | A clue summary: · B clue summary: | |
| 7.4 | Reload during INTRO | same seat and same clue after reload | | |
| 7.5 | Puzzle 1 | team arranges objects, one phone scans, server verifies, both advance | | |
| 7.6 | Puzzle 2 new clues | new clues appear; the Puzzle 1 clue never shows as the Puzzle 2 notes | | |
| 7.7 | Puzzle 2 terminal | boot order built from both phones; each edit visible on the other within ~1 s; note any lost edit (known last-writer-wins risk) | lost edits: | |
| 7.8 | Wrong order | cooldown shown on both; retry after cooldown works | | |
| 7.9 | Final override | both hold ACTIVATE together → POWER RESTORED / MISSION COMPLETE on both; one hold alone is not enough | | |
| 7.10 | Host reset | both return to lobby | | |
| 7.11 | Total mission time | | mm:ss | |

## 8. Facility follows server state only

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 8.1 | Breaker | facility power / lights change only after the server's `breaker` system is on (overlay `systems breaker`), on both phones | | |
| 8.2 | Terminal | terminal effect only after server `terminal` | | |
| 8.3 | Door / exit | exit opens only after server `door` | | |
| 8.4 | No client-only progress | a wrong scan or wrong order never changes the facility | | |
| 8.5 | Live change while placed | Phone B solves something while Phone A is in AR: A's facility reacts without moving from its placed spot | | |

## 9. Interruptions and lifecycle

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 9.1 | Home button / app switch during AR | AR pauses, camera released (indicator off); return shows "AR paused…"; START AR works | | |
| 9.2 | Screen lock during AR, unlock | same as 9.1; no frozen camera | | |
| 9.3 | Switch app during the scanner | scanner stops, camera off; return lets you scan again | | |
| 9.4 | Rotation (portrait ↔ landscape) | layout usable; AR canvas resizes; no stretched camera | | |
| 9.5 | Network loss mid-mission (Airplane Mode 10 s) | RECONNECTING / OFFLINE label, then rejoin with same seat and the current phase | | |
| 9.6 | Phone call / Siri during AR | recovers, camera released | | |
| 9.7 | Camera indicator after leaving every camera screen | off each time | | |

## 10. Performance and thermals (after at least 5 minutes of AR + scanning)

| Measure | Phone A | Phone B |
|---|---|---|
| AR frame time from overlay (start / after 5 min) | | |
| Detector ms per frame (start / after 5 min) | | |
| Felt temperature (cool / warm / hot) | | |
| Battery drop during the test (%) | | |
| Any "thermal" dimming, stutter or Safari reload | | |
| Memory: did Safari reload the page by itself? | | |

## 11. Safety

| # | Check | Expected | Observed | Result |
|---|---|---|---|---|
| 11.1 | Walking warning | the facility footer reads "Floor height is a manual estimate. Watch real obstacles." and is readable; note whether a stronger warning is needed. Virtual walls never imply protection | | |
| 11.2 | Tester walked into nothing real | confirm the test area was clear | | |

## 12. Sign-off

| Field | Value |
|---|---|
| Overall result (DEVICE-VERIFIED / PARTIAL / FAILED) | |
| Required rows not run, and why | |
| Tester signature / date | |
| Reviewer (project lead) / date | |

## 13. Failures and retests

| # | Row | What happened | Debug overlay at the time (build, camera, tracking, error) | Issue / fix commit | Retest date | Retest result |
|---|---|---|---|---|---|---|
| | | | | | | |
