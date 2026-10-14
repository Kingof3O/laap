param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
$actual = [IO.Path]::GetFullPath($Path)
$target = [IO.Path]::GetFullPath($env:LAAP_SIGNPATH_TARGET)
if ($actual -ne $target) {
  $root = [IO.Path]::GetFullPath($env:LAAP_SIGNPATH_RELEASE_ROOT).TrimEnd('\')+'\'
  if (-not $actual.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected signing hook target' }
  Write-Output 'Installer signing is deferred to the verified second stage; the NSIS uninstaller is not separately signed.'
  exit 0
}
if ((Get-FileHash $actual -Algorithm SHA256).Hash -ne (Get-FileHash $env:LAAP_SIGNPATH_PREPARED -Algorithm SHA256).Hash) { throw 'Patched Tauri payload differs from the prepared signing input' }
if ($env:LAAP_SIGNPATH_REQUIRE_SIGNATURE -eq 'True') {
  $signature = Get-AuthenticodeSignature $env:LAAP_SIGNPATH_RETURNED
  if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate -or $signature.SignerCertificate.Subject -notmatch 'CN=SignPath Foundation(?:,|$)') { throw 'A verified Foundation application signature is required' }
}
Copy-Item $env:LAAP_SIGNPATH_RETURNED $actual -Force
Write-Output 'Inserted the verified format-specific application payload after the Tauri marker patch.'
