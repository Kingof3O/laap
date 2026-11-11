param([ValidateSet('studio', 'basic', 'complete')][string[]]$Editions = @('studio', 'basic', 'complete'))

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$desktop = Join-Path $workspace 'apps/desktop'
$artifactRoot = Join-Path $workspace '.artifacts/three-editions-current'
$cargoRoot = Join-Path $workspace '.artifacts/cargo-editions-current'
if (!$IsWindows) { throw 'This QA packaging script targets Windows NSIS.' }

New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
$overlay = Join-Path $artifactRoot 'unsigned-qa.json'
'{"bundle":{"createUpdaterArtifacts":false}}' | Set-Content -LiteralPath $overlay -Encoding utf8NoBOM
$priorTarget = $env:CARGO_TARGET_DIR
$env:CARGO_TARGET_DIR = $cargoRoot
$artifacts = @()
Push-Location $desktop
try {
  foreach ($edition in $Editions) {
    $configName = switch ($edition) {
      studio { 'tauri.studio.conf.json' }
      basic { 'tauri.offline.conf.json' }
      complete { 'tauri.conf.json' }
    }
    $config = Get-Content -Raw -LiteralPath (Join-Path $desktop "src-tauri/$configName") | ConvertFrom-Json
    $arguments = @('exec', '--', 'tauri', 'build', '--debug', '--bundles', 'nsis', '--ci', '--no-sign')
    if ($edition -ne 'complete') { $arguments += @('--config', "src-tauri/$configName") }
    $arguments += @('--config', $overlay)
    $npmCmd = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { 'npm.cmd' } else { 'npm' }
    & $npmCmd @arguments
    if ($LASTEXITCODE -ne 0) { throw "The $edition QA build failed." }
    $filename = "$($config.productName)_$($config.version)_x64-setup.exe"
    $installer = Join-Path $cargoRoot "debug/bundle/nsis/$filename"
    if (!(Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Expected installer is missing: $filename" }
    $output = Join-Path $artifactRoot $filename
    Copy-Item -LiteralPath $installer -Destination $output
    $artifacts += [ordered]@{
      edition = $edition
      identifier = $config.identifier
      filename = $filename
      sha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
      bytes = (Get-Item -LiteralPath $output).Length
      signing = 'unsigned-debug-qa'
    }
  }
  $artifacts | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $artifactRoot 'build-evidence.json') -Encoding utf8NoBOM
  $artifacts | ForEach-Object { "$($_.sha256)  $($_.filename)" } |
    Set-Content -LiteralPath (Join-Path $artifactRoot 'SHA256SUMS.txt') -Encoding utf8NoBOM
} finally {
  Pop-Location
  $env:CARGO_TARGET_DIR = $priorTarget
}
