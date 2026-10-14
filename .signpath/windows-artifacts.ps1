param(
  [Parameter(Mandatory=$true)][ValidateSet('BuildApplications','BundleInstallers','VerifyInstallers')][string]$Stage,
  [switch]$Signed
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
$root = Join-Path $repo '.signpath/out'
$source = if ($Signed) { Join-Path $root 'signed-applications' } else { Join-Path $root 'applications' }
$editions = @(
  @{ Name='team'; Product='LAAP Desktop'; FileName='LAAP-Desktop'; Config=@() },
  @{ Name='offline'; Product='LAAP Offline'; FileName='LAAP-Offline'; Config=@('--config','src-tauri/tauri.offline.conf.json') }
)
$config = Get-Content 'apps/desktop/src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
$version = $config.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Signing requires a three-part numeric release version' }
$offline = Get-Content 'apps/desktop/src-tauri/tauri.offline.conf.json' -Raw | ConvertFrom-Json
if ($offline.version -ne $version) { throw 'Team and Offline versions differ' }

function Assert-Version([string]$Actual) {
  if ($Actual -ne $version -and $Actual -ne "$version.0") { throw "Unexpected product version: $Actual; expected $version" }
}
function Assert-Signature([string]$Path) {
  $signature = Get-AuthenticodeSignature $Path
  if ($signature.Status -ne 'Valid') { throw "Invalid Authenticode signature: $Path ($($signature.Status))" }
  if (-not $signature.TimeStamperCertificate) { throw "Missing trusted timestamp: $Path" }
  if ($signature.SignerCertificate.Subject -notmatch 'CN=SignPath Foundation(?:,|$)') { throw "Unexpected signing publisher: $Path" }
}
function Assert-FileSet([string]$Root,[string[]]$Expected) {
  $actual = @(Get-ChildItem $Root -Recurse -File | ForEach-Object { [IO.Path]::GetRelativePath($Root, $_.FullName).Replace('\','/') } | Sort-Object)
  if (($actual -join '|') -ne (($Expected | Sort-Object) -join '|')) { throw 'The signing output contains missing or unexpected files' }
}
function Assert-Application([string]$Path,[string]$Product) {
  $info = (Get-Item $Path).VersionInfo
  if ($info.ProductName -ne $Product) { throw "Unexpected product name: $($info.ProductName); expected $Product" }
  Assert-Version $info.ProductVersion
  Assert-Version $info.FileVersion
  if ($Signed) { Assert-Signature $Path }
  return $info
}
function Run-Tauri([string[]]$Arguments) {
  & npx --workspace '@laap/desktop' tauri @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Tauri failed with exit code $LASTEXITCODE" }
}
function Output([string]$Name,[string]$Value) {
  if ($env:GITHUB_OUTPUT) { "$Name=$Value" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8 }
}

if ($Stage -eq 'BuildApplications') {
  $first = $null
  foreach ($edition in $editions) {
    Run-Tauri (@('build','--ci','--no-bundle') + $edition.Config)
    $app = Join-Path $repo 'apps/desktop/src-tauri/target/release/laap-desktop-core.exe'
    $info = Assert-Application $app $edition.Product
    if ($first -and ($first.ProductVersion -ne $info.ProductVersion -or $first.FileVersion -ne $info.FileVersion)) { throw 'Windows application metadata differs between editions' }
    $first = $info
    $dest = Join-Path $root "applications/$($edition.Name)"
    New-Item $dest -ItemType Directory -Force | Out-Null
    Copy-Item $app (Join-Path $dest 'laap-desktop-core.exe') -Force
    Write-Output "$($edition.Product): ProductVersion=$($info.ProductVersion), FileVersion=$($info.FileVersion)"
  }
  Output 'version' $version
  Output 'product-version' $first.ProductVersion
  Output 'file-version' $first.FileVersion
}

if ($Stage -eq 'BundleInstallers') {
  Assert-FileSet $source @('team/laap-desktop-core.exe','offline/laap-desktop-core.exe')
  $first = $null
  foreach ($edition in $editions) {
    $app = Join-Path $source "$($edition.Name)/laap-desktop-core.exe"
    $null = Assert-Application $app $edition.Product
    Copy-Item $app 'apps/desktop/src-tauri/target/release/laap-desktop-core.exe' -Force
    $bundle = Join-Path $repo 'apps/desktop/src-tauri/target/release/bundle'
    # These are disposable build outputs; deleting them avoids selecting the other edition's installer.
    if (Test-Path $bundle) { Remove-Item $bundle -Recurse -Force }
    Run-Tauri (@('bundle','--ci','--bundles','nsis,msi','--no-sign') + $edition.Config)
    $binaryHash = (Get-FileHash $app -Algorithm SHA256).Hash
    if ((Get-FileHash 'apps/desktop/src-tauri/target/release/laap-desktop-core.exe' -Algorithm SHA256).Hash -ne $binaryHash) { throw 'Bundling replaced the signed application' }
    $exe = @(Get-ChildItem "$bundle/nsis/*-setup.exe")
    $msi = @(Get-ChildItem "$bundle/msi/*.msi")
    if ($exe.Count -ne 1 -or $msi.Count -ne 1) { throw 'Expected exactly one EXE and one MSI per edition' }
    $info = $exe[0].VersionInfo
    if ($info.ProductName -ne $edition.Product) { throw 'Installer product name mismatch' }
    Assert-Version $info.ProductVersion
    Assert-Version $info.FileVersion
    if ($first -and ($first.ProductVersion -ne $info.ProductVersion -or $first.FileVersion -ne $info.FileVersion)) { throw 'Installer metadata differs between editions' }
    $first = $info
    $dest = Join-Path $root "installers/$($edition.Name)"
    New-Item $dest -ItemType Directory -Force | Out-Null
    Copy-Item $exe[0].FullName (Join-Path $dest "$($edition.FileName)-$version-x64-setup.exe") -Force
    Copy-Item $msi[0].FullName (Join-Path $dest "$($edition.FileName)-$version-x64.msi") -Force
  }
  Output 'product-version' $first.ProductVersion
  Output 'file-version' $first.FileVersion
}

if ($Stage -eq 'VerifyInstallers') {
  $installerRoot = if ($Signed) { Join-Path $root 'signed-installers' } else { Join-Path $root 'installers' }
  $expected = @()
  foreach ($edition in $editions) {
    $expected += "$($edition.Name)/$($edition.FileName)-$version-x64-setup.exe"
    $expected += "$($edition.Name)/$($edition.FileName)-$version-x64.msi"
  }
  Assert-FileSet $installerRoot $expected
  $manifest = @()
  foreach ($edition in $editions) {
    $app = Join-Path $source "$($edition.Name)/laap-desktop-core.exe"
    $null = Assert-Application $app $edition.Product
    $appHash = (Get-FileHash $app -Algorithm SHA256).Hash
    foreach ($extension in @('exe','msi')) {
      $name = if ($extension -eq 'exe') { "$($edition.FileName)-$version-x64-setup.exe" } else { "$($edition.FileName)-$version-x64.msi" }
      $installer = Join-Path $installerRoot "$($edition.Name)/$name"
      if (-not (Test-Path $installer)) { throw "Missing installer $name" }
      if ($Signed) { Assert-Signature $installer }
      $extract = Join-Path $root "extracted/$($edition.Name)-$extension"
      New-Item $extract -ItemType Directory -Force | Out-Null
      if ($extension -eq 'exe') {
        & 7z x $installer "-o$extract" -y | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'NSIS extraction failed' }
      } else {
        $process = Start-Process msiexec.exe -ArgumentList @('/a',('"'+$installer+'"'),'/qn',('TARGETDIR="'+$extract+'"')) -PassThru -Wait
        if ($process.ExitCode -notin @(0,3010)) { throw "MSI administrative extraction failed: $($process.ExitCode)" }
      }
      $embedded = @(Get-ChildItem $extract -Recurse -File -Filter 'laap-desktop-core.exe')
      if ($embedded.Count -ne 1) { throw "Expected one LAAP application inside $name" }
      if ((Get-FileHash $embedded[0].FullName -Algorithm SHA256).Hash -ne $appHash) { throw "Bundled application differs in $name" }
      if ($Signed) { Assert-Signature $embedded[0].FullName }
      $manifest += @{ edition=$edition.Name; file=$name; sha256=(Get-FileHash $installer -Algorithm SHA256).Hash; signed=[bool]$Signed; appSha256=$appHash }
    }
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $installerRoot 'manifest.json') -Encoding utf8
  Write-Output ('Verified four installer packages. SignPath signatures required: '+[bool]$Signed)
}
