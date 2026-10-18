# AR Manual Test: Two Real Phones

A human runs this checklist on real phones. Claude cannot run it. Nothing below has passed until a person has run it and filled in the results.

Mark each step **PASS**, **FAIL** (with a note), or **BLOCKED** (with the reason).

## 0. Before you start

1. **The build must pass.** Run `npm run build` in `ar/` (room module) and at the repo root (marker prototype). Both passed after the A1 types fix on 2026-10-17. Do not test a build that fails.
2. **Use HTTPS.** Open the page over HTTPS. Plain `http://<laptop-ip>` gives the page no camera and no motion sensors (see "HTTPS route" at the end).
3. **Phones:** use at least one iPhone (Safari) and one Android phone (Chrome), both on current OS versions.
4. **Print the tags** from `ar/print/tags.html` at 100% scale on white paper. Keep the white border (quiet zone). Tape one to each object: book, cup, keys. Old cards with `ROOMSHIFT:BOOK` payloads no longer scan; reprint them.
5. **Light the room evenly.** Avoid glare on glossy paper and strong backlight from windows.
6. **Record for each run:** date and time, test URL, commit hash, and the run sheet at the bottom.

What can be tested today:

| Area | Code | Two-phone test possible now? |
|---|---|---|
| Shared room render, motion, drag, tap | `room/`, `demo/main.ts` | One phone only. `LocalSync` uses BroadcastChannel, which connects tabs in one browser and never two phones. |
| Room sync between phones | `DeepSpaceSync` (Task A3) | **Blocked** until A3 is done. |
| QR tag scanning, `roomshift:v1:<id>` | `CameraScanSession`, shown in `PhysicalPuzzle.tsx` | Yes, on each phone separately (local result only). |
| Marker order puzzle | `PhysicalPuzzle.tsx` | Yes, on each phone separately (local result only). |
| AI Scanner (COCO-SSD book + cup, QR keys) | `AiScanner.tsx`, `detect/` | Yes, on each phone separately (section E, local result only). |

## A. Shared AR room, one phone (possible after the build is fixed)

1. Open the room page on phone 1 and tap **Host a room**. The Blackout Protocol control room renders. The text is readable in portrait, the frame does not stutter, and the HUD is not hidden under the notch. All three buttons (Motion, Recenter, Reset) are fully on screen, wrapping to a second row on narrow phones.
2. Drag with one finger. The view rotates and the page does not scroll or zoom.
3. Tap **Motion**.
   - **iPhone:** a motion permission prompt appears. Allow it. Moving the phone now turns the view.
   - **Android:** no prompt appears. Moving the phone turns the view.
   - The toast says "Motion on: move your phone. Tap Recenter to face the breaker." Write down the exact text if it differs (for example "No motion sensor data").
4. Walk a full circle. The view follows smoothly, with no jumps at 0°/360° and no flip when you look straight up or down.
5. Point the phone anywhere and tap **Recenter**. That direction becomes the breaker wall.
6. Rotate the phone to landscape. The view is still level, not rotated 90°. (Older iOS without `screen.orientation` is a known risk here.)
7. Tap the bobbing diamond at the breaker. The lights come on. Then tap the terminal, then the door. Each step changes the room, and the door slides open.
8. Tap the door before the breaker (use Reset first). You see a "Restore breaker first." notice and nothing changes. These are the demo-only rules from `sync/rules.ts`; production gating belongs to the backend.
9. Repeat step 3 on an iPhone and tap **Don't Allow**. Drag still works, and the toast says "Motion access was denied. Drag to look instead." Over plain HTTP the toast says "Motion needs HTTPS" instead.
10. Lock the phone for 10 s, then unlock it. The page resumes without a blank canvas and the controls still respond. Rendering is paused while the page is hidden, so the phone should not get warm in the background; write down if it does.

## B. Shared AR room, two phones (BLOCKED until Task A3 DeepSpaceSync)

11. **Phone 1:** host a room and note the room code.
12. **Phone 2:** join with the code, or by opening the guest URL. Both phones show the same room in the same state.
13. **Phone 2:** tap the breaker. Within about 1 s, both phones show the lights on. Then tap the terminal on phone 1. Both phones update.
14. Turn phone 1 around slowly. On phone 2, the orb that shows phone 1's view moves the same way. Do the reverse with phone 2.
15. On both phones at once, quickly tap the same next system. The state on both phones ends up identical and nothing gets applied twice.
16. Lock phone 2 for 10 s. Phone 1 removes phone 2's orb within about 3 s. Unlock phone 2. It rejoins, its state matches phone 1, and the orb comes back.
17. Turn on airplane mode on phone 2 for 10 s, then turn it off. Phone 2 recovers or shows a clear reconnect message.
18. Host taps **Reset**. Both phones return to blackout.

## C. Physical input, QR tag scanning (marker puzzle page, one phone at a time)

19. Open the scan screen and allow the camera. The rear camera opens (not the selfie camera) and the preview is not mirrored.
20. Scan the BOOK, CUP and KEYS tags in turn. Each scan gives a vibration (Android) and the "SCANNED:" line under the progress bar reads `BOOK → CUP → KEYS`.
21. Hold the same tag in view for 3 s. It is recorded only once (1.5 s debounce).
22. Scan an unrelated QR code (for example any website QR) and an old `ROOMSHIFT:BOOK` card. Both are ignored without a crash and nothing is added.
23. Make the room dim. Scanning gets harder: note the distance and angle that still work. On Android Chrome a **Torch on** button appears; check that it lights the cards. On iPhone there is no torch button, and the guidance line suggests more light.
24. Close the scan screen. The camera indicator (the green dot on iOS, the camera icon on Android) turns off.
25. Start a scan, then lock the phone and unlock it. The camera was released, and scanning resumes or asks to restart.
26. Deny camera permission (reset site permissions first). The manual code field appears and is reachable in at most 2 taps. Entering the sequence by hand works. On an iPhone, tapping a dropdown must not zoom the page, and on phones up to about 430 px wide the three dropdowns are stacked and read "Select object" in full.
27. Open the page over plain HTTP. You see an "insecure context" message and the manual field. The page must not crash or hang.
28. Tap **Clear scans** and confirm the list empties. (In the game, the scanner's result is sent as `puzzle:submit` evidence and only the backend's answer moves the game forward; the full two-phone check is `docs/IPHONE_FINAL_ACCEPTANCE.md`.)

## D. Marker order puzzle, existing jsQR prototype (one phone at a time)

29. Open the prototype page and tap **Enable camera**. The rear camera opens, and outlines and BOOK/CUP/KEYS badges line up with the real cards.
30. Put the cards in the wrong order. All three are detected and the puzzle stays unsolved.
31. Arrange them BOOK → CUP → KEYS and hold steady for 1.2 s. The puzzle solves once and the camera turns off.
32. Hide one card. Its badge clears and the hold resets.
33. Deny the camera. The error message appears, and **Manual demo** works and is labelled manual.
34. Start scanning, switch apps, and come back. Scanning is paused and needs an explicit restart.

## E. AI Scanner on iPhone Safari (one phone; not yet run on any real phone)

Use the same HTTPS URL as above, on Wi-Fi the first time (the model is about 18 MB). Put a real book (cover facing the camera, upright or tilted towards the phone), a mug or cup, and the keys with their printed KEYS QR tag in one row on a table.

35. Open the puzzle page. **AI scanner** is selected. "INITIALIZING AI" and a spinner appear, then "CAMERA READY" and **Start AI camera**. Write down the load time. The camera must not open before you tap.
36. Tap **Start AI camera** and allow access. The rear camera preview plays inline (not fullscreen) with no sound prompt, and the header shows "AI LIVE".
37. Point at the book and cup. Boxes appear on the real objects with labels like "BOOK 52%" and "CUP 91%". Boxes line up with the objects in portrait. Write down the ms value in the bottom-right caption (inference time per frame).
38. Before the KEYS tag is visible, the KEYS chip reads **NEEDS QR TAG** and the puzzle never solves, even with book and cup in the right order for 10 s.
39. Show the KEYS QR tag in the same view. The KEYS chip reads **QR**, and with BOOK → CUP → KEYS held steady the status goes "HOLD STEADY", the bar fills, and the puzzle solves. The success panel shows "BOOK · AI / CUP · AI / KEYS · QR".
40. Put a second cup in view. The status reads "DUPLICATE OBJECT" and the puzzle does not solve.
41. Point at things that are not puzzle objects (a laptop, a person). They are drawn dimmed with their class name, and the status says "OBJECT NOT RECOGNIZED".
42. Note how the book is recognized: flat on the table, upright, partly covered, in dim light. COCO-SSD lite is weakest on books; record what works for the demo.
43. Lock the phone during scanning, then unlock. "Camera paused…" appears and **Restart AI camera** works. The camera indicator turned off while locked.
44. While AI is live, tap **QR backup**. The camera indicator turns off. Tap **Enable camera** and the QR scanner works as in section D. Switch back to **AI scanner**: it is ready at once (no second model load).
45. Scan for 2 minutes. Note whether the phone gets warm and whether the ms caption grows.
46. Turn on airplane mode, clear website data, and reload. The AI scanner fails to load and **Switch to QR backup** appears. (Or on a slow connection: after 15 s the same button appears while loading continues.)
47. Add the page to the Home Screen (Share → Add to Home Screen), open it from there, and repeat 35–39. Note any difference from Safari, especially camera permission prompts.

## Run sheet

| # | Phone (model / OS / browser) | Result | Notes (time to detect, lighting, distance) |
|---|---|---|---|
| 1 | | | |
| … | | | |

## HTTPS route

**Recommended: deploy to DeepSpace.** Open `https://roomshift.app.space` (or the AR page path once it is included in the DeepSpace app build). It has a trusted certificate, so there are no browser warnings and iOS motion works. Both phones reach the backend on the same origin, and the guest Wi-Fi does not matter.

**The AI model files** (`ar/public/models/coco-ssd/`, 17.5 MB) must be deployed with the app at `/models/coco-ssd/ssdlite_mobilenet_v2/`. Check that `https://<host>/models/coco-ssd/ssdlite_mobilenet_v2/model.json` opens in the phone's browser before testing section E.

**For quick single-phone checks during development:** run the Vite dev server over self-signed HTTPS on the LAN, or use a tunnel. Both need extra setup, which is described in the A1 report. Campus or hackathon Wi-Fi often blocks phone-to-laptop traffic, so use a phone hotspot if the page does not load. Self-signed certificates show a warning page on each phone that you must accept, and iOS can be inconsistent with them.
