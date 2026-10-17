# Physical iPhone test record — Issue #6

**Result: NOT PERFORMED. Do not describe the facility as working on iPhone yet.**

| Field | Recorded value |
| --- | --- |
| Target phone, supplied by user | iPhone 18 Pro |
| Target OS, supplied by user | iOS 27.0.1 |
| Target browser | Safari |
| Device/OS independently verified | No |
| Physical tester | Pending |
| Test date/time | Pending |
| HTTPS deployment URL | Pending deployment |
| Tested commit/build | Pending |
| Lighting / floor texture / free space | Pending |

Follow [the physical acceptance procedure](ROOM_SCALE_AR.md#physical-iphone-acceptance-procedure). Replace each Pending with actual observations, including failure details; do not infer success from desktop checks.

| Check | Status | Observations/evidence |
| --- | --- | --- |
| Camera remains off before Start | Pending | |
| Safari camera and motion permission flow | Pending | |
| Live rear camera and SLAM startup | Pending | |
| Floor alignment and stable placement | Pending | |
| Measured nominal 3.4 m width / 3.4 m depth / 2.5 m height | Pending | Record measurements and error. |
| Entrance faces starting viewpoint | Pending | |
| Physical walk-around / 6DoF parallax | Pending | |
| Drift after 60 seconds and one walk-around loop | Pending | Record displacement if measurable. |
| Restore Power / blackout visual change | Pending | |
| Reposition replaces old placement | Pending | |
| Tracking-loss controls and recovery | Pending | |
| Portrait / landscape / Safari chrome resize | Pending | |
| Background / lock / return / restart | Pending | |
| Camera indicator off after Stop and exit | Pending | |
| Motion denied and permission recovery | Pending | |
| Camera denied and permission recovery | Pending | |
| Sustained use / temperature / frame stability | Pending | |

Automated checks run on Linux Chromium. A simulated XR8 pipeline is used for lifecycle and interaction tests; only engine/chunk loading uses the real distributed binary. Those checks are not physical-device evidence.
