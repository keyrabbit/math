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

## Two things that look like implementation detail but are not

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
```

`-Action Build` stops after producing the APK at
`native/android/app/build/outputs/apk/debug/app-debug.apk`.

The script asserts the APK actually contains `assets/www/*`. An APK missing its payload installs
and launches perfectly happily, and fails as a white screen on the tablet.

### Sideloading onto a Fire tablet

1. On the tablet: **Settings → Device Options → About Fire Tablet**, tap the serial number seven
   times to reveal Developer Options, then enable **ADB Debugging**.
2. Connect over USB and accept the trust prompt.
3. `.\tools\Invoke-AndroidBuild.ps1 -Action Install`

Or copy the APK across and open it, having allowed installation from unknown sources.

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
.\tools\Invoke-MacBuild.ps1 -Action Preflight                              # connectivity, Xcode, simulators
.\tools\Invoke-MacBuild.ps1 -Action Run                                    # build, launch, screenshot, verify storage
.\tools\Invoke-MacBuild.ps1 -Action Run -Simulator 'iPhone 17 Pro'         # phone breakpoint
.\tools\Invoke-MacBuild.ps1 -Action Clean                                  # remove everything from the Mac
```

The screenshot lands in `app-bakery/docs/shots-native/`.

Simulators are resolved by **UDID**, not by name. Which device names exist depends on which
runtimes are installed, so `-destination 'name=iPad Pro 11-inch (M4)'` can fail with
"Unable to find a device matching the provided destination specifier" even when `simctl` lists
that device. The script matches the name against `-showdestinations` and takes the newest
runtime.

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
| Launches and renders | ✅ API 30 emulator, 2560×1800 | ✅ iPad Air 11-inch (M4), iOS 26.5 |
| No console or runtime errors | ✅ | ✅ |
| `localStorage` survives app exit | ✅ real save data in LevelDB | ✅ key present in WebKit sqlite |
| Hardware/system back behaves | ✅ | n/a |
| Runs on physical hardware | ⏳ no Fire tablet on hand | ❌ needs a team ID |
