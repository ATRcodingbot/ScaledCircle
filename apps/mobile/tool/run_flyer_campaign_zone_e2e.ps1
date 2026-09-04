param(
  [string]$FlutterSdk = $env:FLUTTER_ROOT,
  [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($FlutterSdk)) {
  $flutterCommand = Get-Command flutter -ErrorAction Stop
  $FlutterSdk = Split-Path -Parent (Split-Path -Parent $flutterCommand.Source)
}

$dartExecutable = Join-Path $FlutterSdk 'bin\cache\dart-sdk\bin\dart.exe'
$flutterSnapshot = Join-Path $FlutterSdk 'bin\cache\flutter_tools.snapshot'
$canvasKitSource = Join-Path $FlutterSdk 'bin\cache\flutter_web_sdk\canvaskit\chromium'
$canvasKitTarget = Join-Path $mobileRoot 'test\canvaskit\chromium'
$canvasKitRoot = Split-Path -Parent $canvasKitTarget

foreach ($required in @(
  $dartExecutable,
  $flutterSnapshot,
  (Join-Path $canvasKitSource 'canvaskit.js'),
  (Join-Path $canvasKitSource 'canvaskit.wasm')
)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required Flutter Chrome test artifact is missing: $required"
  }
}

$emulators = Invoke-RestMethod -Uri 'http://127.0.0.1:4400/emulators' -TimeoutSec 5
if ($null -eq $emulators.auth -or $null -eq $emulators.firestore) {
  throw 'Firebase Auth and Firestore emulators must be running before this test.'
}

if (Test-Path -LiteralPath $canvasKitRoot) {
  throw "Refusing to replace an existing test CanvasKit directory: $canvasKitRoot"
}

$stdout = Join-Path ([System.IO.Path]::GetTempPath()) "scaledcircle-zone-e2e-$PID.out"
$stderr = Join-Path ([System.IO.Path]::GetTempPath()) "scaledcircle-zone-e2e-$PID.err"

try {
  New-Item -ItemType Directory -Path $canvasKitTarget | Out-Null
  Copy-Item -LiteralPath (Join-Path $canvasKitSource 'canvaskit.js') -Destination $canvasKitTarget
  Copy-Item -LiteralPath (Join-Path $canvasKitSource 'canvaskit.wasm') -Destination $canvasKitTarget

  $arguments = @(
    $flutterSnapshot,
    'test',
    'test\flyer_campaign_zone_end_to_end_emulator_test.dart',
    '--platform', 'chrome',
    '--dart-define=APP_ENV=local',
    '--dart-define=RUN_FIREBASE_EMULATOR_INTEGRATION=true',
    '--reporter', 'expanded'
  )
  $processArguments = @{
    FilePath = $dartExecutable
    ArgumentList = $arguments
    WorkingDirectory = $mobileRoot
    RedirectStandardOutput = $stdout
    RedirectStandardError = $stderr
    WindowStyle = 'Hidden'
    PassThru = $true
  }
  $process = Start-Process @processArguments

  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    throw "Flutter Chrome/Firebase integration test exceeded ${TimeoutSeconds}s."
  }

  Get-Content -LiteralPath $stdout
  Get-Content -LiteralPath $stderr
  if ($process.ExitCode -ne 0) {
    throw "Flutter Chrome/Firebase integration test failed with exit code $($process.ExitCode)."
  }
} finally {
  if (Test-Path -LiteralPath $canvasKitRoot) {
    Remove-Item -LiteralPath $canvasKitRoot -Recurse -Force
  }
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
