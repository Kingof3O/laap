param(
  [Parameter(Mandatory=$true)][ValidateSet('BuildApplications','PrepareApplications','BundleInstallers','VerifyInstallers')][string]$Stage,
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

if ($Stage -in @('BuildApplications','PrepareApplications')) {
  $first = $null
  foreach ($edition in $editions) {
    if ($Stage -eq 'BuildApplications') {
      Run-Tauri (@('build','--ci','--no-bundle') + $edition.Config)
      $app = Join-Path $repo 'apps/desktop/src-tauri/target/release/laap-desktop-core.exe'
    } else {
      $app = Join-Path $root "compiled/$($edition.Name)/laap-desktop-core.exe"
    }
    $info = Assert-Application $app $edition.Product
    if ($first -and ($first.ProductVersion -ne $info.ProductVersion -or $first.FileVersion -ne $info.FileVersion)) { throw 'Windows application metadata differs between editions' }
    $first = $info
    $compiled = Join-Path $root "compiled/$($edition.Name)"
    New-Item $compiled -ItemType Directory -Force | Out-Null
    if ($Stage -eq 'BuildApplications') { Copy-Item $app (Join-Path $compiled 'laap-desktop-core.exe') -Force }
    $bytes = [IO.File]::ReadAllBytes($app)
    $text = [Text.Encoding]::Latin1.GetString($bytes)
    $marker = '__TAURI_BUNDLE_TYPE_VAR_UNK'
    $offset = $text.IndexOf($marker, [StringComparison]::Ordinal)
    if ($offset -lt 0 -or $text.IndexOf($marker, $offset+1, [StringComparison]::Ordinal) -ge 0) { throw 'Expected exactly one Tauri bundle marker' }
    foreach ($format in @('nsis','msi')) {
      $dest = Join-Path $root "applications/$($edition.Name)/$format"
      New-Item $dest -ItemType Directory -Force | Out-Null
      $prepared = [byte[]]$bytes.Clone()
      $kind = if ($format -eq 'nsis') { 'NSS' } else { 'MSI' }
      $replacement = [Text.Encoding]::ASCII.GetBytes("__TAURI_BUNDLE_TYPE_VAR_$kind")
      [Buffer]::BlockCopy($replacement,0,$prepared,$offset,$replacement.Length)
      [IO.File]::WriteAllBytes((Join-Path $dest 'laap-desktop-core.exe'),$prepared)
    }
    Write-Output "$($edition.Product): ProductVersion=$($info.ProductVersion), FileVersion=$($info.FileVersion)"
  }
  Output 'version' $version
  Output 'product-version' $first.ProductVersion
  Output 'file-version' $first.FileVersion
}

if ($Stage -eq 'BundleInstallers') {
  Assert-FileSet $source @('team/nsis/laap-desktop-core.exe','team/msi/laap-desktop-core.exe','offline/nsis/laap-desktop-core.exe','offline/msi/laap-desktop-core.exe')
  $first = $null
  $target = Join-Path $repo 'apps/desktop/src-tauri/target/release/laap-desktop-core.exe'
  New-Item (Split-Path $target -Parent) -ItemType Directory -Force | Out-Null
  foreach ($edition in $editions) {
    foreach ($format in @('nsis','msi')) {
      $app = Join-Path $source "$($edition.Name)/$format/laap-desktop-core.exe"
      $null = Assert-Application $app $edition.Product
      $compiled = Join-Path $root "compiled/$($edition.Name)/laap-desktop-core.exe"
      Copy-Item $compiled $target -Force
      $bundle = Join-Path $repo 'apps/desktop/src-tauri/target/release/bundle'
      if (Test-Path $bundle) { Remove-Item $bundle -Recurse -Force }
      $env:LAAP_SIGNPATH_TARGET = $target
      $env:LAAP_SIGNPATH_RELEASE_ROOT = Split-Path $target -Parent
      $env:LAAP_SIGNPATH_PREPARED = Join-Path $root "applications/$($edition.Name)/$format/laap-desktop-core.exe"
      $env:LAAP_SIGNPATH_RETURNED = $app
      $env:LAAP_SIGNPATH_REQUIRE_SIGNATURE = [string][bool]$Signed
      $hook = Join-Path $repo '.signpath/app-signing-hook.ps1'
      $hookConfig = Join-Path $root 'tauri-signing-hook.json'
      @{bundle=@{windows=@{signCommand=@{cmd='pwsh';args=@('-NoProfile','-File',$hook,'%1')}}}} | ConvertTo-Json -Depth 8 | Set-Content $hookConfig -Encoding utf8
      Run-Tauri (@('bundle','--ci','--bundles',$format) + $edition.Config + @('--config',$hookConfig))
      if ((Get-FileHash $target -Algorithm SHA256).Hash -ne (Get-FileHash $compiled -Algorithm SHA256).Hash) { throw 'Tauri did not restore the compiled application' }
      $dest = Join-Path $root "installers/$($edition.Name)"
      New-Item $dest -ItemType Directory -Force | Out-Null
      if ($format -eq 'nsis') {
        $files = @(Get-ChildItem "$bundle/nsis/*-setup.exe")
        if ($files.Count -ne 1) { throw 'Expected one NSIS installer' }
        $info = $files[0].VersionInfo
        if ($info.ProductName -ne $edition.Product) { throw 'Installer product name mismatch' }
        Assert-Version $info.ProductVersion
        Assert-Version $info.FileVersion
        if ($first -and ($first.ProductVersion -ne $info.ProductVersion -or $first.FileVersion -ne $info.FileVersion)) { throw 'Installer metadata differs between editions' }
        $first = $info
        Copy-Item $files[0].FullName (Join-Path $dest "$($edition.FileName)-$version-x64-setup.exe") -Force
      } else {
        $files = @(Get-ChildItem "$bundle/msi/*.msi")
        if ($files.Count -ne 1) { throw 'Expected one MSI installer' }
        Copy-Item $files[0].FullName (Join-Path $dest "$($edition.FileName)-$version-x64.msi") -Force
      }
    }
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
    foreach ($extension in @('exe','msi')) {
      $format = if ($extension -eq 'exe') { 'nsis' } else { 'msi' }
      $app = Join-Path $source "$($edition.Name)/$format/laap-desktop-core.exe"
      $null = Assert-Application $app $edition.Product
      $appHash = (Get-FileHash $app -Algorithm SHA256).Hash
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
