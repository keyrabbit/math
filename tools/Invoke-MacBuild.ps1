<#
.SYNOPSIS
    Build and smoke-test the Crumb's Bakery iOS app on a remote Mac over SSH.

.DESCRIPTION
    Windows has no iOS toolchain, so the Mac is used as a build appliance. This script keeps the
    whole round trip in one place: build the web bundle locally, ship the iOS shell and bundle to
    a scratch directory on the Mac, generate the Xcode project, build for a simulator, install,
    launch and bring back a screenshot as evidence.

    Nothing is installed system-wide on the Mac. XcodeGen is fetched as a self-contained binary
    into the scratch directory and can be removed with -Action Clean.

.PARAMETER Action
    Preflight  Check connectivity and report Xcode, simulators and toolchain state. Changes nothing.
    Build      Full round trip: build web, sync, generate, xcodebuild.
    Run        Build, then install and launch on every -Simulator and collect a screenshot of each.
    Clean      Remove the scratch directory on the Mac.

.PARAMETER Simulators
    One or more simulator names. The app is compiled once — a Debug-iphonesimulator bundle runs on
    any iOS simulator, phone or tablet — and then installed on each in turn.

.EXAMPLE
    .\tools\Invoke-MacBuild.ps1 -Action Preflight
.EXAMPLE
    .\tools\Invoke-MacBuild.ps1 -Action Run
.EXAMPLE
    .\tools\Invoke-MacBuild.ps1 -Action Run -Simulators 'iPhone SE (3rd generation)'
#>
[CmdletBinding()]
param(
    [ValidateSet('Preflight', 'Build', 'Run', 'Clean')]
    [string]$Action = 'Preflight',

    [string]$MacHost = '192.168.0.159',
    [string]$MacUser = 'gio',
    [string]$KeyPath = "$HOME\.ssh\cheesy-mac",
    [string]$RemoteRoot = '~/CopilotWork/math-ios',

    # Each is matched against `xcodebuild -showdestinations`; the newest matching runtime wins.
    # A phone and a tablet by default: the layout has to hold at both extremes, and the cheapest
    # way to keep that true is to make the default run prove it every time.
    [string[]]$Simulators = @('iPhone 17', 'iPad Air 11-inch (M4)'),

    [string]$XcodeGenVersion = '2.43.0',
    [string]$OutDir = "$PSScriptRoot\..\app-bakery\docs\shots-native"
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$bakery = Join-Path $repoRoot 'app-bakery'
$iosDir = Join-Path $bakery 'native\ios'
$remote = "$MacUser@$MacHost"

$sshOpts = @(
    '-o', 'BatchMode=yes'
    '-o', 'IdentitiesOnly=yes'
    '-o', 'ConnectTimeout=15'
    '-o', "UserKnownHostsFile=$HOME\.ssh\known_hosts"
    '-i', $KeyPath
)

function Invoke-Remote {
    param([Parameter(Mandatory)][string]$Script, [switch]$AllowFail, [switch]$Quiet)
    # This file is CRLF on Windows, and a trailing \r makes zsh read `fi` as `fi\r`, which is not
    # the keyword: an if-block silently never closes and fails as a parse error on a later line.
    $Script = $Script -replace "`r", ''
    $output = ssh @sshOpts $remote $Script 2>&1
    if (-not $Quiet) { $output | ForEach-Object { Write-Host $_ } }
    if ($LASTEXITCODE -ne 0 -and -not $AllowFail) {
        throw "Remote command failed (exit $LASTEXITCODE): $Script"
    }
    return $output
}

function Assert-Prerequisites {
    if (-not (Test-Path $KeyPath)) {
        throw "SSH key not found at $KeyPath. See app-bakery/native/README.md."
    }
}

function Invoke-Preflight {
    Assert-Prerequisites
    Write-Host "`n=== Mac preflight: $remote ===" -ForegroundColor Cyan
    Invoke-Remote @'
echo "host:      $(scutil --get ComputerName 2>/dev/null || hostname)"
echo "macOS:     $(sw_vers -productVersion) ($(uname -m))"
echo "xcode:     $(xcodebuild -version 2>/dev/null | head -1)"
echo "xcodegen:  $(~/CopilotWork/tools/xcodegen/bin/xcodegen --version 2>/dev/null || echo 'not fetched yet')"
echo "free disk: $(df -h / | awk 'NR==2 {print $4}')"
echo "--- simulators ---"
xcrun simctl list devices available | grep -E 'iPhone|iPad' | head -30
'@ | Out-Null
}

function Sync-Sources {
    Write-Host "`n=== Building web bundle ===" -ForegroundColor Cyan
    Push-Location $bakery
    try {
        # The native shells always consume dist-native, never dist: it is built with a relative
        # base so index.html works when mounted under a custom scheme rather than at a site root.
        # Piped to Out-Host so npm's progress output cannot leak into the function's return value.
        npm run build:native | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'npm run build:native failed.' }
    }
    finally { Pop-Location }

    $www = Join-Path $iosDir 'Resources\www'
    if (Test-Path $www) { Remove-Item $www -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Join-Path $iosDir 'Resources') | Out-Null
    Copy-Item (Join-Path $bakery 'dist-native') $www -Recurse -Force
    Write-Host "Staged $((Get-ChildItem $www -Recurse -File).Count) web files into Resources/www."

    Write-Host "`n=== Syncing to $remote ===" -ForegroundColor Cyan
    $zip = Join-Path $env:TEMP 'crumbs-ios.zip'
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path (Join-Path $iosDir '*') -DestinationPath $zip -Force

    Invoke-Remote "rm -rf $RemoteRoot && mkdir -p $RemoteRoot" | Out-Null
    scp @sshOpts $zip "${remote}:$RemoteRoot/src.zip"
    if ($LASTEXITCODE -ne 0) { throw 'scp failed.' }
    Invoke-Remote "cd $RemoteRoot && unzip -q src.zip && rm src.zip && echo `"synced `$(find . -type f | wc -l) files`"" | Out-Null
}

function Install-XcodeGen {
    $url = "https://github.com/yonaskolb/XcodeGen/releases/download/$XcodeGenVersion/xcodegen.zip"
    Invoke-Remote @"
set -e
mkdir -p ~/CopilotWork/tools && cd ~/CopilotWork/tools
if [ ! -x xcodegen/bin/xcodegen ]; then
  curl -sSL -o xg.zip '$url' && unzip -q -o xg.zip && rm xg.zip
fi
./xcodegen/bin/xcodegen --version
"@ | Out-Null
}

function Invoke-Build {
    Assert-Prerequisites
    Sync-Sources
    Install-XcodeGen

    Write-Host "`n=== Generating project and building ===" -ForegroundColor Cyan
    Invoke-Remote "cd $RemoteRoot && ~/CopilotWork/tools/xcodegen/bin/xcodegen generate --spec project.yml" | Out-Null

    # Resolve each simulator to a UDID. Destination-by-name is fragile because the installed
    # runtimes decide which device names exist; a UDID is unambiguous.
    $dests = Invoke-Remote "cd $RemoteRoot && xcodebuild -project CrumbsBakery.xcodeproj -scheme CrumbsBakery -showdestinations 2>/dev/null | grep 'iOS Simulator'" -Quiet

    $targets = foreach ($name in $Simulators) {
        # Anchor on the closing brace of the name field, or 'iPhone 17' also matches
        # 'iPhone 17 Pro Max' and the newest-runtime pick silently lands on the wrong device.
        $match = $dests |
            Where-Object { $_ -match ('name:' + [regex]::Escape($name) + '\s*\}') } |
            Select-Object -Last 1
        if (-not $match) {
            throw "No simulator matching '$name'. Run -Action Preflight to list what is installed."
        }
        if ($match -notmatch 'id:([0-9A-Fa-f-]{36})') { throw "Could not parse a UDID from: $match" }
        $udid = $Matches[1]
        $os = if ($match -match 'OS:([0-9.]+)') { $Matches[1] } else { 'unknown' }
        $slug = ($name.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')

        Write-Host "Simulator: $name (iOS $os) $udid" -ForegroundColor Green
        [pscustomobject]@{ Name = $name; Udid = $udid; Os = $os; Slug = $slug }
    }

    # One compile serves all of them: a Debug-iphonesimulator bundle is not device-specific, so
    # building per simulator would spend minutes producing identical bytes.
    $buildUdid = @($targets)[0].Udid
    Invoke-Remote "cd $RemoteRoot && xcodebuild -project CrumbsBakery.xcodeproj -scheme CrumbsBakery -configuration Debug -destination 'id=$buildUdid' -derivedDataPath build build 2>&1 | grep -E 'error:|BUILD SUCCEEDED|BUILD FAILED' || true" | Out-Null

    $ok = Invoke-Remote "test -d $RemoteRoot/build/Build/Products/Debug-iphonesimulator/CrumbsBakery.app && echo APP_OK" -AllowFail
    if ($ok -notcontains 'APP_OK') { throw 'Build produced no .app bundle.' }
    Write-Host 'Build succeeded.' -ForegroundColor Green

    # Script scope rather than a return value: in PowerShell every uncaptured expression in a
    # function body joins its output, so `return $targets` would hand the caller the npm and
    # xcodebuild chatter as well.
    $script:Targets = @($targets)
}

function Invoke-Run {
    Invoke-Build | Out-Null
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    $results = @()

    foreach ($t in $script:Targets) {
        Write-Host "`n=== $($t.Name) — installing and launching ===" -ForegroundColor Cyan

        # The sequence matters, and both waits are gates rather than guesses. A cold simulator
        # takes ~5s just to start its WebContent process, so a fixed sleep produced a screenshot
        # of the background colour and a background-and-flush that ran before the app's module
        # had executed — the app looked broken twice over while being perfectly healthy.
        #
        # Gate 1: screenshot until the frame has real content. A flat brown screen is a ~70KB PNG;
        # the rendered title screen is 2.7-4.5MB of gradient, skyline and starfield. The margin is
        # enormous, so a size floor is a reliable "has it drawn yet" test without needing JS.
        # Gate 2: background the app and wait for the save file, which proves the module ran.
        $out = Invoke-Remote @"
set -e
D=$($t.Udid)
APP=$RemoteRoot/build/Build/Products/Debug-iphonesimulator/CrumbsBakery.app
SHOT=$RemoteRoot/shots/$($t.Slug).png
mkdir -p $RemoteRoot/shots
xcrun simctl boot `$D 2>/dev/null || true
xcrun simctl bootstatus `$D -b
xcrun simctl terminate `$D com.keyrabbit.crumbsbakery 2>/dev/null || true
xcrun simctl uninstall `$D com.keyrabbit.crumbsbakery 2>/dev/null || true
xcrun simctl install `$D `$APP
xcrun simctl launch `$D com.keyrabbit.crumbsbakery >/dev/null
SZ=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  sleep 5
  xcrun simctl io `$D screenshot "`$SHOT" >/dev/null 2>&1 || true
  SZ=`$(stat -f%z "`$SHOT" 2>/dev/null || echo 0)
  [ "`$SZ" -gt 300000 ] && break
done
echo "RENDERED:`$SZ"
# Backgrounding is what fires visibilitychange, which is what flushes the save.
xcrun simctl launch `$D com.apple.Preferences >/dev/null 2>&1 || true
C=`$(xcrun simctl get_app_container `$D com.keyrabbit.crumbsbakery data)
HIT=''
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 5
  HIT=`$(find "`$C" -path '*LocalStorage*' -name 'localstorage.sqlite3*' -type f | head -1)
  [ -n "`$HIT" ] && break
done
echo "STORAGE:`$HIT"
# Leave the app in the foreground; deploying to a simulator is pointless if it ends on Settings.
xcrun simctl launch `$D com.keyrabbit.crumbsbakery >/dev/null
"@ -Quiet

        $text = $out -join "`n"
        $rendered = $false
        if ($text -match 'RENDERED:(\d+)') { $rendered = [int]$Matches[1] -gt 300000 }
        if ($rendered) { Write-Host 'Rendered a real frame.' -ForegroundColor Green }
        else { Write-Warning "$($t.Name) never drew anything but the background colour." }

        $stored = [bool]($text -match 'STORAGE:\S+')
        if ($stored) { Write-Host 'localStorage persisted for the bakery:// origin.' -ForegroundColor Green }
        else { Write-Warning "Could not confirm localStorage on $($t.Name)." }

        $dest = Join-Path $OutDir "ios-$($t.Slug)-title.png"
        scp @sshOpts "${remote}:$RemoteRoot/shots/$($t.Slug).png" $dest
        if ($LASTEXITCODE -ne 0) { throw "Failed to collect the screenshot for $($t.Name)." }
        Write-Host "Screenshot: $dest" -ForegroundColor Green

        $results += [pscustomobject]@{
            Simulator  = $t.Name
            iOS        = $t.Os
            Rendered   = if ($rendered) { 'ok' } else { 'BLANK' }
            Storage    = if ($stored) { 'ok' } else { 'NOT CONFIRMED' }
            Screenshot = Split-Path $dest -Leaf
        }
    }

    # Leave the simulators on screen: the point of deploying to them is to be able to look.
    Invoke-Remote 'open -a Simulator' -AllowFail -Quiet | Out-Null

    Write-Host "`n=== Deployed ===" -ForegroundColor Cyan
    $results | Format-Table -AutoSize | Out-Host
    if ($results.Storage -contains 'NOT CONFIRMED' -or $results.Rendered -contains 'BLANK') {
        throw 'At least one simulator failed a check. See the warnings above.'
    }
}

switch ($Action) {
    'Preflight' { Invoke-Preflight }
    'Build' { Invoke-Build | Out-Null }
    'Run' { Invoke-Run }
    'Clean' {
        Assert-Prerequisites
        Invoke-Remote "rm -rf $RemoteRoot ~/CopilotWork/tools/xcodegen && echo cleaned" | Out-Null
    }
}
