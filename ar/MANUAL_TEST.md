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

## A. Shared AR room, one phone (possible after the build is fixed)

1. Open the room page on phone 1 and tap **Host a room**. The Blackout Protocol control room renders. The text is readable in portrait, the frame does not stutter, and the HUD is not hidden under the notch.
2. Drag with one finger. The view rotates and the page does not scroll or zoom.
3. Tap **Motion**.
   - **iPhone:** a motion permission prompt appears. Allow it. Moving the phone now turns the view.
   - **Android:** no prompt appears. Moving the phone turns the view.
   - Write down the exact toast text.
4. Walk a full circle. The view follows smoothly, with no jumps at 0°/360° and no flip when you look straight up or down.
5. Point the phone anywhere and tap **Recenter**. That direction becomes the breaker wall.
6. Rotate the phone to landscape. The view is still level, not rotated 90°. (Older iOS without `screen.orientation` is a known risk here.)
7. Tap the bobbing diamond at the breaker. The lights come on. Then tap the terminal, then the door. Each step changes the room, and the door slides open.
8. Tap the door before the breaker (use Reset first). You see a "Restore breaker first." notice and nothing changes. These are the demo-only rules from `sync/rules.ts`; production gating belongs to the backend.
9. Repeat step 3 on an iPhone and tap **Don't Allow**. Drag still works, and the toast says motion is unavailable.
10. Lock the phone for 10 s, then unlock it. The page resumes without a blank canvas and the controls still respond. Also write down whether the phone got noticeably warm while the page was in the background.

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
26. Deny camera permission (reset site permissions first). The manual code field appears and is reachable in at most 2 taps. Entering the sequence by hand works.
27. Open the page over plain HTTP. You see an "insecure context" message and the manual field. The page must not crash or hang.
28. Tap **Clear scans** and confirm the list empties. (Sending the sequence in `puzzle:submit` needs the frontend integration, Task A4. Only the backend's answer may move the game forward.)

## D. Marker order puzzle, existing jsQR prototype (one phone at a time)

29. Open the prototype page and tap **Enable camera**. The rear camera opens, and outlines and BOOK/CUP/KEYS badges line up with the real cards.
30. Put the cards in the wrong order. All three are detected and the puzzle stays unsolved.
31. Arrange them BOOK → CUP → KEYS and hold steady for 1.2 s. The puzzle solves once and the camera turns off.
32. Hide one card. Its badge clears and the hold resets.
33. Deny the camera. The error message appears, and **Manual demo** works and is labelled manual.
34. Start scanning, switch apps, and come back. Scanning is paused and needs an explicit restart.

## Run sheet

| # | Phone (model / OS / browser) | Result | Notes (time to detect, lighting, distance) |
|---|---|---|---|
| 1 | | | |
| … | | | |

## HTTPS route

**Recommended: deploy to DeepSpace.** Open `https://roomshift.app.space` (or the AR page path once it is included in the DeepSpace app build). It has a trusted certificate, so there are no browser warnings and iOS motion works. Both phones reach the backend on the same origin, and the guest Wi-Fi does not matter.

**For quick single-phone checks during development:** run the Vite dev server over self-signed HTTPS on the LAN, or use a tunnel. Both need extra setup, which is described in the A1 report. Campus or hackathon Wi-Fi often blocks phone-to-laptop traffic, so use a phone hotspot if the page does not load. Self-signed certificates show a warning page on each phone that you must accept, and iOS can be inconsistent with them.
