# Native shells

Crumb's Bakery is a web app. These are two thin native hosts for it — one Android/Fire OS, one
iOS — so it can be sideloaded onto a Kindle Fire and installed on an iPhone or iPad.

Both are hand-written. There is no Capacitor, no Cordova, no React Native. The web app has zero
runtime dependencies and that property was worth keeping.

```
native/
  android/   Gradle project, one Java Activity
  ios/       XcodeGen spec, three Swift files
```

Neither shell contains game logic. Their entire job is to host a `WebView` and get four things
right: where the bundle is served from, when state is flushed, what the back gesture does, and
what the app is allowed to reach.

---

## Three things that look like implementation detail but are not

### 1. The bundle is never served from `file://`

`localStorage` is the whole save system — mastery, streaks, sprinkles, settings, all of it lives
under the key `crumbs-bakery.save.v1`. A `WebView` loading a `file://` URL gets an **opaque
origin**, and storage on an opaque origin is unreliable: sometimes empty on next launch,
sometimes throwing outright, varying by OS version.

So both shells give the page a real origin:

| Platform | Origin | Mechanism |
| --- | --- | --- |
| Android | `https://appassets.androidplatform.net/www/` | `WebViewAssetLoader` (androidx.webkit) |
| iOS | `bakery://app/` | Custom `WKURLSchemeHandler` |

This is the same conclusion Capacitor and Cordova reached, for the same reason.

It is verified rather than assumed. On both platforms the build scripts check that the save key
is physically on disk after a launch — in the WebKit `localstorage.sqlite3` on iOS, and in the
Chromium LevelDB under `app_webview/Default/Local Storage/` on Android.

A side effect worth having: because every request resolves inside the app bundle, there is no
code path from the page to the network at all. For a children's app that is a structural
property rather than a promise.

### 2. The build target is pinned at ES2017

Vite's default build target assumes an evergreen browser. A Fire tablet is not evergreen.

This was not theoretical. The first APK installed and launched fine and rendered **nothing** —
just the brown background. The only evidence was one line in `adb logcat`:

```
[INFO:CONSOLE(1)] "Uncaught SyntaxError: Unexpected token '='",
  source: https://appassets.androidplatform.net/www/assets/index-d6zFSns5.js
```

The API 30 emulator ships Android System WebView **83**. Logical assignment (`??=`, `||=`)
needs Chrome 85. The app was one operator away from a blank screen on real hardware.

`vite.config.ts` now pins `build.target: "es2017"`, which keeps `<script type="module">` viable
(Chrome 61+) while transpiling everything newer. `index.html` also carries a `nomodule` script
so a genuinely ancient WebView shows a readable message instead of a brown void.

**If you ever see a blank screen on a device, read `adb logcat -s chromium:*` first.** The
process stays alive and healthy; only the console knows.

### 3. Transpiling the syntax does not bring the APIs with it

Pinning the build target fixed the blank screen, and the title screen then rendered
pixel-perfect. That was misleading. `build.target` rewrites *syntax*; it does not polyfill
*APIs*. Tapping **Open the bakery** did nothing at all, and the console said:

```
Uncaught TypeError: a.replaceChildren is not a function
```

`Element.replaceChildren` is Chrome **86**. Every screen transition used it, so the app was
unplayable past the title on WebView 83 — while looking completely healthy in a screenshot.

The fix is `setChildren()` in `src/core/dom.ts`, used at all nine former call sites. Anything
that swaps a node's children should use it rather than `replaceChildren`.

The lesson generalises: after this, the whole codebase was swept for post-83 platform features.

| Feature | Needs | Effect on WebView 83 | Action |
| --- | --- | --- | --- |
| `??=` `||=` `&&=` | Chrome 85 | **Blank screen** — parse error | Fixed by `build.target: es2017` |
| `Element.replaceChildren` | Chrome 86 | **Unplayable** — navigation throws | Fixed by `setChildren()` |
| CSS `inset` shorthand | Chrome 87 | Overlays not positioned | Fixed — longhand `top/right/bottom/left` |
| Flex/grid `gap` | Chrome 84 | Cosmetic — tighter spacing | Accepted |
| CSS `aspect-ratio` | Chrome 88 | Cosmetic — some boxes size loosely | Accepted |

The line is drawn where behaviour is: anything that breaks *function* is fixed, anything that
costs a few pixels of spacing is not. The last two were judged from an actual device screenshot
(`docs/shots-native/android-summary.png`) rather than from the spec tables — the summary card is
tight but entirely correct and readable. Real Fire tablets get WebView updates through the
Amazon Appstore and run far newer than 83; the emulator is deliberately the pessimistic case.

**How this is checked now:** `-Action Verify` plays a whole recipe inside the WebView on the
device over the Chrome DevTools Protocol and fails if any console error appears. A screenshot
would not have caught this bug. See `tools/device-lesson-qa.mjs`.

---

## The web bundle: `dist-native`, never `dist`

Both shells consume `app-bakery/dist-native/`, produced by:

```powershell
npm run build:native      # tsc && vite build --base=./ --outDir dist-native
```

`--base=./` is what matters. A default Vite build emits absolute `/assets/…` paths, which break
the moment `index.html` is mounted at `/www/index.html` or under a custom scheme.

The bundle is copied into each shell at build time and is gitignored in both places, so a stale
bundle can never ship. Android fails the Gradle build outright if `dist-native` is missing.

---

## Android / Fire OS

### One-time toolchain setup

Nothing here needs administrator rights; `winget` was avoided because it blocks on an elevation
prompt. Everything lives under `C:\UsrP\toolchain` and can be deleted wholesale.

```powershell
$tc = 'C:\UsrP\toolchain'
New-Item -ItemType Directory -Force -Path $tc | Out-Null

# JDK 17 (portable zip, no installer)
Invoke-WebRequest 'https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip' -OutFile "$tc\jdk17.zip"
Expand-Archive "$tc\jdk17.zip" -DestinationPath $tc

# Android command-line tools
Invoke-WebRequest 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile "$tc\cli.zip"
New-Item -ItemType Directory -Force -Path "$tc\android-sdk\cmdline-tools" | Out-Null
Expand-Archive "$tc\cli.zip" -DestinationPath "$tc\android-sdk\cmdline-tools"
Rename-Item "$tc\android-sdk\cmdline-tools\cmdline-tools" 'latest'

# Gradle 8.9 (AGP 8.5 needs 8.7+)
Invoke-WebRequest 'https://services.gradle.org/distributions/gradle-8.9-bin.zip' -OutFile "$tc\gradle.zip"
Expand-Archive "$tc\gradle.zip" -DestinationPath $tc

# SDK packages
$env:JAVA_HOME = (Get-ChildItem $tc -Directory -Filter 'jdk-17*')[0].FullName
$sdk = "$tc\android-sdk\cmdline-tools\latest\bin\sdkmanager.bat"
("y`n" * 30) | & $sdk --licenses
& $sdk 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'
```

Optional, for testing without hardware:

```powershell
& $sdk 'emulator' 'system-images;android-30;google_apis;x86_64'
$env:ANDROID_AVD_HOME = "$tc\avd"
& "$tc\android-sdk\cmdline-tools\latest\bin\avdmanager.bat" create avd `
    -n fire_test -k 'system-images;android-30;google_apis;x86_64' -d pixel_c
```

The Gradle wrapper is checked in, so `gradle` itself is only needed to regenerate it.

### Everyday use

```powershell
.\tools\Invoke-AndroidBuild.ps1 -Action Preflight   # what is installed, what is attached
.\tools\Invoke-AndroidBuild.ps1 -Action Emulator    # start the test tablet
.\tools\Invoke-AndroidBuild.ps1 -Action Install     # build, install, launch, screenshot, check logcat
.\tools\Invoke-AndroidBuild.ps1 -Action Verify      # play a whole recipe inside the running app
```

`-Action Build` stops after producing the APK at
`native/android/app/build/outputs/apk/debug/app-debug.apk`.

The script asserts the APK actually contains `assets/www/*`. An APK missing its payload installs
and launches perfectly happily, and fails as a white screen on the tablet.

`-Action Verify` is the one that earns its keep. It forwards the WebView's devtools socket over
`adb`, then drives the real on-device page with `tools/device-lesson-qa.mjs`: onboarding, age
band, a map node, eight facts, the summary card, and finally a read of `localStorage` to confirm
progress was actually saved. It fails on any console error. Expect:

```
[7] console errors: 0
RESULT: PASS
```

### Sideloading onto a Fire tablet

For someone who just wants to try it, the built APK is published as a prerelease:
<https://github.com/keyrabbit/math/releases/tag/bakery-v0.1.0-test>. Open that page in the
tablet's Silk browser, allow **Settings → Security & Privacy → Apps from Unknown Sources** for
Silk, and install the download. No PC or cable involved.

Over USB instead:

1. On the tablet: **Settings → Device Options → About Fire Tablet**, tap the serial number seven
   times to reveal Developer Options, then enable **ADB Debugging**.
2. Connect over USB and accept the trust prompt.
3. `.\tools\Invoke-AndroidBuild.ps1 -Action Install`

The debug APK is signed with the standard Android debug key, which is sufficient for sideloading.
It is deliberately kept debuggable so `chrome://inspect` remote WebView debugging works on real
hardware — the only practical way to diagnose layout on a Fire tablet.

### Choices made in `MainActivity.java`

| Choice | Reason |
| --- | --- |
| `minSdk 22` | Fire OS 5 is Android 5.1. Costs nothing for a WebView app. |
| `targetSdk 34` | Amazon requires a recent target; Fire OS runs higher targets in compatibility mode. |
| Immersive sticky | A child's palm on the edge of the screen should not summon the system bars. |
| Zoom, callouts, overscroll glow all off | Every one of them is a way to accidentally break the layout mid-question. |
| `onPause` flushes the store | Mirrors the web app's `pagehide` flush. Android can kill a paused process without further warning. |
| Back → `window.crumb.back()` | The in-app back affordance is the real navigation. Falls through to normal Android behaviour (leave the app) only when the current screen has no back. |
| `shouldOverrideUrlLoading` refuses to leave the bundled origin | There is nowhere legitimate to navigate to. |
| Zero permissions in the manifest | Nothing is requested, so nothing can be misused. |

---

## iOS

Windows cannot build iOS, so the Mac is used as a build appliance over SSH. Nothing is installed
system-wide on it: XcodeGen is fetched as a self-contained binary into `~/CopilotWork/tools/` and
`-Action Clean` removes it along with the scratch directory.

### Requirements

- SSH key at `~/.ssh/cheesy-mac` with access to the Mac
- Xcode with iOS simulator runtimes installed

Verified against macOS 26.6.2 (arm64) with Xcode 26.6.

### Use

```powershell
.\tools\Invoke-MacBuild.ps1 -Action Preflight                                    # connectivity, Xcode, simulators
.\tools\Invoke-MacBuild.ps1 -Action Run                                          # iPhone + iPad: build, launch, verify
.\tools\Invoke-MacBuild.ps1 -Action Run -Simulators 'iPhone SE (3rd generation)'  # the tightest layout
.\tools\Invoke-MacBuild.ps1 -Action Clean                                        # remove everything from the Mac
```

`-Action Run` deploys to **an iPhone and an iPad by default** — the layout has to hold at both
extremes and the cheapest way to keep that true is to prove it on every run. The app is compiled
once: a `Debug-iphonesimulator` bundle is not device-specific, so building per simulator would
spend minutes producing identical bytes.

Screenshots land in `app-bakery/docs/shots-native/ios-<device>-title.png`.

Simulators are resolved by **UDID**, not by name. Which device names exist depends on which
runtimes are installed, so `-destination 'name=iPad Pro 11-inch (M4)'` can fail with
"Unable to find a device matching the provided destination specifier" even when `simctl` lists
that device. The script matches the name against `-showdestinations` and takes the newest
runtime. The match is anchored on the end of the name field, or `iPhone 17` also matches
`iPhone 17 Pro Max` and the newest-runtime pick silently lands on the wrong device.

### Both waits are gates, not guesses

A cold simulator needs roughly 5 seconds just to start its WebContent process, and longer when
the Mac is still busy from the build. An early fixed sleep made the app look broken twice over
while it was perfectly healthy:

- the screenshot caught the background colour, so the iPhone appeared to render nothing;
- the app was backgrounded before its module had run, so nothing was ever flushed and the
  storage assertion failed.

Both are now polled to a real signal:

| Gate | Signal | Why it is trustworthy |
| --- | --- | --- |
| Rendered | screenshot PNG exceeds 300 KB | A flat brown screen is ~70 KB; the drawn title screen is 2.7–4.5 MB of gradient, skyline and starfield. The margin is enormous. |
| Storage | `localstorage.sqlite3` exists | Only appears once the page has run and been backgrounded, so it also proves the module executed. |

The run fails if either gate is not met, and finishes by bringing the app back to the foreground
and opening Simulator — deploying to a simulator is pointless if it ends up sitting on Settings.

Worth knowing when reading these results: **the app writes nothing until it is backgrounded or
played.** A fresh install parked on the title screen legitimately has an empty `LocalStorage`
directory, so "no save file" on its own is not evidence of a storage fault.

### A green deploy is not a working app

Both gates above passed on a build whose lesson screen was unusable on a phone: the keypad
covered the equation, and the recipe title sat on top of the solved facts. The gates only ever
see the title screen, and the title screen was perfect.

The cause was a layout that had been reasoned about rather than measured. Every lesson
breakpoint in `src/styles/screens.css` was keyed on viewport *height* or on tablet *width*, so a
modern tall phone — 393×852 — matched none of them and inherited the base layout, which reserves
26vh for the shelf band and 306px for the keypad. That leaves the ladder 166px to do 200px of
work, and because `.lesson__body` is a centred flex column the overflow goes in both directions
at once: upwards over the title, downwards under the keypad. It only becomes visible after a
couple of facts have been solved and the ladder has grown, which is why no screenshot caught it.

Sweeping 23 viewports with a scripted measurement found the same class of fault in two more
places that had never been looked at:

| Viewport | Verdict |
| --- | --- |
| 393×852, 402×874, 430×932 | Phones fell through every breakpoint into the roomy base layout |
| 1024×768, 1180×820, 1440×900 | Landscape tablets and laptops sat in the gap between `min-height: 900px` and `max-height: 700px` |
| 768×1024 | The tablet rule fired 100px of height before its own keypad would fit |

The repair is three new tiers plus `overflow: hidden` on `.lesson__body`, so that if a future
change ever exceeds the space again the content is clipped rather than silently drawn on top of
the keypad. All 23 viewports now leave the ladder at least 10px of headroom, and the phone case
was confirmed on the iPhone 17 simulator **mid-lesson** — see
`docs/shots-native/ios-iphone-17-lesson.png` — not at the title screen.

The lesson for this pipeline: screenshot the screen the child actually spends the session on.

### Choices made in the Swift shell

| Choice | Reason |
| --- | --- |
| No `SceneDelegate`, no scene manifest | One full-screen surface, no multi-window, no state restoration to describe. |
| `WKWebView` is **not** inset to the safe area | The CSS already uses `env(safe-area-inset-*)`; insetting again would double the padding and letterbox the canvas. |
| Bounce, pinch-zoom and callouts disabled | Same reasoning as Android. |
| `willResignActive` flushes the store | Mirrors `pagehide`. |
| Navigation policy denies anything off-scheme; `window.open` denied | Same closed world as Android. |
| Code signing disabled | Simulator builds only, for now. See below. |

### Current limitation: simulator only

A build that installs on a physical iPhone or iPad needs an Apple Developer team ID, which is not
available here. `project.yml` sets `CODE_SIGNING_ALLOWED: NO`.

To produce a device build, set `DEVELOPMENT_TEAM` and re-enable signing in `project.yml`. Nothing
else about the shell needs to change. Tracked in issue #8.

---

## Verified state

| | Android | iOS |
| --- | --- | --- |
| Builds | ✅ | ✅ |
| Launches and renders | ✅ API 30 emulator, 2560×1800 | ✅ iPhone 17 and iPad Air 11-inch (M4), iOS 26.5 |
| Lesson screen fits the device | ✅ | ✅ iPhone 17, mid-lesson, two facts solved |
| No console or runtime errors | ✅ | ✅ |
| A whole recipe can be completed | ✅ scripted, on-device, 8 facts + summary | ⏳ rendering verified, not scripted |
| `localStorage` survives app exit | ✅ real save data in LevelDB | ✅ `localstorage.sqlite3` for both devices |
| Hardware/system back behaves | ✅ | n/a |
| Runs on physical hardware | ⏳ no Fire tablet on hand | ❌ needs a team ID |

"Launches and renders" was true for a build that could not get past its own title screen. The
row that matters is the third one.
