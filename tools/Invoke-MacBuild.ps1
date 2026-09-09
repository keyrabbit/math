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
    Run        Build, then install and launch on a simulator and collect a screenshot.
    Clean      Remove the scratch directory on the Mac.

.EXAMPLE
    .\tools\Invoke-MacBuild.ps1 -Action Preflight
.EXAMPLE
    .\tools\Invoke-MacBuild.ps1 -Action Run -Simulator 'iPad Air 11-inch (M4)'
#>
[CmdletBinding()]
param(
    [ValidateSet('Preflight', 'Build', 'Run', 'Clean')]
    [string]$Action = 'Preflight',

    [string]$MacHost = '192.168.0.159',
    [string]$MacUser = 'gio',
    [string]$KeyPath = "$HOME\.ssh\cheesy-mac",
    [string]$RemoteRoot = '~/CopilotWork/math-ios',

    # Matched against `xcodebuild -showdestinations`; the newest matching runtime wins.
    [string]$Simulator = 'iPad Air 11-inch (M4)',

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
echo "--- iPad simulators ---"
xcrun simctl list devices available | grep -i ipad | head -12
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

    # Resolve the simulator to a UDID. Destination-by-name is fragile because the installed
    # runtimes decide which device names exist; a UDID is unambiguous.
    $dests = Invoke-Remote "cd $RemoteRoot && xcodebuild -project CrumbsBakery.xcodeproj -scheme CrumbsBakery -showdestinations 2>/dev/null | grep 'iOS Simulator'" -Quiet
    $match = $dests |
        Where-Object { $_ -match [regex]::Escape($Simulator) } |
        Select-Object -Last 1
    if (-not $match) {
        throw "No simulator matching '$Simulator'. Run -Action Preflight to list what is installed."
    }
    if ($match -notmatch 'id:([0-9A-Fa-f-]{36})') { throw "Could not parse a UDID from: $match" }
    $udid = $Matches[1]
    Write-Host "Simulator: $($match.Trim())" -ForegroundColor Green

    Invoke-Remote "cd $RemoteRoot && xcodebuild -project CrumbsBakery.xcodeproj -scheme CrumbsBakery -configuration Debug -destination 'id=$udid' -derivedDataPath build build 2>&1 | grep -E 'error:|BUILD SUCCEEDED|BUILD FAILED' || true" | Out-Null

    $ok = Invoke-Remote "test -d $RemoteRoot/build/Build/Products/Debug-iphonesimulator/CrumbsBakery.app && echo APP_OK" -AllowFail
    if ($ok -notcontains 'APP_OK') { throw 'Build produced no .app bundle.' }
    Write-Host 'Build succeeded.' -ForegroundColor Green

    # Script scope rather than a return value: in PowerShell every uncaptured expression in a
    # function body joins its output, so `return $udid` would hand the caller the npm and
    # xcodebuild chatter as well.
    $script:SimulatorUdid = $udid
}

function Invoke-Run {
    Invoke-Build | Out-Null
    $udid = $script:SimulatorUdid
    Write-Host "`n=== Installing and launching ===" -ForegroundColor Cyan
    Invoke-Remote @"
set -e
D=$udid
APP=$RemoteRoot/build/Build/Products/Debug-iphonesimulator/CrumbsBakery.app
xcrun simctl boot `$D 2>/dev/null || true
xcrun simctl bootstatus `$D -b
xcrun simctl uninstall `$D com.keyrabbit.crumbsbakery 2>/dev/null || true
xcrun simctl install `$D `$APP
xcrun simctl launch `$D com.keyrabbit.crumbsbakery
sleep 8
mkdir -p $RemoteRoot/shots
xcrun simctl io `$D screenshot $RemoteRoot/shots/ios-launch.png
"@ | Out-Null

    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    $dest = Join-Path $OutDir 'ios-ipad-title.png'
    scp @sshOpts "${remote}:$RemoteRoot/shots/ios-launch.png" $dest
    if ($LASTEXITCODE -ne 0) { throw 'Failed to collect the screenshot.' }
    Write-Host "Screenshot: $dest" -ForegroundColor Green

    # localStorage is the entire save system, and a custom scheme rather than file:// is the only
    # reason it works. Prove it is really on disk instead of assuming.
    Write-Host "`n=== Verifying localStorage ===" -ForegroundColor Cyan
    $found = Invoke-Remote @"
D=$udid
xcrun simctl launch `$D com.apple.Preferences >/dev/null 2>&1 || true
sleep 4
C=`$(xcrun simctl get_app_container `$D com.keyrabbit.crumbsbakery data)
grep -rl 'crumbs-bakery.save.v1' "`$C" 2>/dev/null | head -1
"@ -AllowFail
    if ($found -match 'LocalStorage') {
        Write-Host 'localStorage persisted for the bakery:// origin.' -ForegroundColor Green
    }
    else {
        Write-Warning 'Could not confirm localStorage on disk. Storage may not be persisting.'
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
