<#
.SYNOPSIS
    Build, install and smoke-test the Crumb's Bakery Android/Fire OS app.

.DESCRIPTION
    Wraps the Gradle build so the toolchain locations live in one place rather than in whichever
    shell happens to be open. Everything the build needs (JDK, Android SDK, Gradle) is expected
    under -ToolchainRoot; see app-bakery/native/README.md for how to provision it.

.PARAMETER Action
    Preflight  Report toolchain and device state. Changes nothing.
    Build      Build the web bundle, then assemble the debug APK.
    Install    Build, then install and launch on the first connected device or emulator.
    Emulator   Start the local test emulator in the background.

.EXAMPLE
    .\tools\Invoke-AndroidBuild.ps1 -Action Preflight
.EXAMPLE
    .\tools\Invoke-AndroidBuild.ps1 -Action Install
#>
[CmdletBinding()]
param(
    [ValidateSet('Preflight', 'Build', 'Install', 'Emulator')]
    [string]$Action = 'Preflight',

    [string]$ToolchainRoot = 'C:\UsrP\toolchain',
    [string]$AvdName = 'fire_test',
    [string]$OutDir = "$PSScriptRoot\..\app-bakery\docs\shots-native"
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$bakery = Join-Path $repoRoot 'app-bakery'
$androidDir = Join-Path $bakery 'native\android'

$jdk = Get-ChildItem $ToolchainRoot -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
    Select-Object -First 1
# Not $jdk?.FullName: without braces PowerShell parses that as a variable literally named `jdk?`,
# which is always null, so the toolchain silently looks missing.
$env:JAVA_HOME = if ($jdk) { $jdk.FullName } else { $null }
$env:ANDROID_HOME = Join-Path $ToolchainRoot 'android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_AVD_HOME = Join-Path $ToolchainRoot 'avd'

$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
$package = 'com.keyrabbit.crumbsbakery.debug'
$activity = "$package/com.keyrabbit.crumbsbakery.MainActivity"
$apk = Join-Path $androidDir 'app\build\outputs\apk\debug\app-debug.apk'

function Assert-Toolchain {
    if (-not $env:JAVA_HOME) { throw "No JDK 17 found under $ToolchainRoot. See app-bakery/native/README.md." }
    if (-not (Test-Path $adb)) { throw "Android platform-tools missing at $adb." }
}

function Invoke-Preflight {
    Write-Host "`n=== Android toolchain ===" -ForegroundColor Cyan
    Write-Host "JAVA_HOME:    $(if ($env:JAVA_HOME) { $env:JAVA_HOME } else { '(missing)' })"
    Write-Host "ANDROID_HOME: $env:ANDROID_HOME"
    if ($env:JAVA_HOME) { & "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Select-Object -First 1 }
    foreach ($p in 'platform-tools', 'platforms\android-34', 'build-tools\34.0.0') {
        $present = Test-Path (Join-Path $env:ANDROID_HOME $p)
        Write-Host ("  {0,-26} {1}" -f $p, $(if ($present) { 'ok' } else { 'MISSING' }))
    }
    Write-Host "`n=== Devices ===" -ForegroundColor Cyan
    if (Test-Path $adb) { & $adb devices } else { Write-Host '(adb missing)' }
}

function Invoke-Build {
    Assert-Toolchain
    Write-Host "`n=== Building web bundle ===" -ForegroundColor Cyan
    Push-Location $bakery
    try {
        # dist-native, not dist: relative base plus an es2017 target for old Fire WebViews.
        npm run build:native
        if ($LASTEXITCODE -ne 0) { throw 'npm run build:native failed.' }
    }
    finally { Pop-Location }

    # local.properties is machine-specific and gitignored, so write it rather than expect it.
    $escaped = $env:ANDROID_HOME -replace '\\', '\\' -replace ':', '\:'
    [System.IO.File]::WriteAllText((Join-Path $androidDir 'local.properties'), "sdk.dir=$escaped`n")

    Write-Host "`n=== Assembling APK ===" -ForegroundColor Cyan
    Push-Location $androidDir
    try {
        & .\gradlew.bat assembleDebug --no-daemon
        if ($LASTEXITCODE -ne 0) { throw 'Gradle assembleDebug failed.' }
    }
    finally { Pop-Location }

    if (-not (Test-Path $apk)) { throw "Gradle reported success but no APK at $apk." }

    # An APK missing its web payload still installs and launches, and fails as a white screen on
    # the tablet. Cheaper to catch here.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
    try {
        $count = @($zip.Entries | Where-Object { $_.FullName -like 'assets/www/*' }).Count
        if ($count -eq 0) { throw 'APK contains no assets/www. The web bundle did not make it in.' }
        Write-Host ("APK: {0:N0} bytes, {1} bundled web files." -f (Get-Item $apk).Length, $count) -ForegroundColor Green
    }
    finally { $zip.Dispose() }
}

function Invoke-Install {
    Invoke-Build
    Write-Host "`n=== Installing ===" -ForegroundColor Cyan
    $devices = @(& $adb devices | Select-String '\tdevice$')
    if ($devices.Count -eq 0) {
        throw 'No device or emulator attached. Run -Action Emulator, or connect a Fire tablet with ADB debugging enabled.'
    }
    & $adb install -r $apk
    if ($LASTEXITCODE -ne 0) { throw 'adb install failed.' }

    & $adb logcat -c
    & $adb shell am force-stop $package
    & $adb shell am start -n $activity | Out-Null
    Start-Sleep -Seconds 12

    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    $shot = Join-Path $OutDir 'android-title.png'
    & $adb exec-out screencap -p > $shot
    Write-Host "Screenshot: $shot" -ForegroundColor Green

    # A WebView too old for the bundle throws a SyntaxError and renders nothing; the app process
    # stays alive, so only the console tells you.
    $errors = & $adb logcat -d -s chromium:* AndroidRuntime:E 2>&1 |
        Select-String 'Uncaught|FATAL EXCEPTION'
    if ($errors) {
        Write-Warning 'JavaScript or runtime errors detected:'
        $errors | ForEach-Object { Write-Warning "  $_" }
    }
    else {
        Write-Host 'No JavaScript or runtime errors.' -ForegroundColor Green
    }
}

function Start-Emulator {
    Assert-Toolchain
    $emulator = Join-Path $env:ANDROID_HOME 'emulator\emulator.exe'
    if (-not (Test-Path $emulator)) { throw "Emulator not installed. See app-bakery/native/README.md." }
    Write-Host "Starting AVD '$AvdName'..." -ForegroundColor Cyan
    Start-Process -FilePath $emulator `
        -ArgumentList '-avd', $AvdName, '-no-snapshot', '-no-boot-anim', '-gpu', 'swiftshader_indirect', '-no-audio'
    & $adb wait-for-device
    & $adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
    Write-Host 'Emulator booted.' -ForegroundColor Green
    & $adb devices
}

switch ($Action) {
    'Preflight' { Invoke-Preflight }
    'Build' { Invoke-Build }
    'Install' { Invoke-Install }
    'Emulator' { Start-Emulator }
}
