param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class LaapInstallerCapture {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd,out RECT rect);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd,IntPtr hdc,uint flags);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
$Installer=(Resolve-Path $Installer).Path
New-Item -ItemType Directory -Force -Path $Output | Out-Null
function Capture-Page([string]$Name,[switch]$Advance) {
 $proc=Start-Process -FilePath $Installer -PassThru
 try {
  $until=(Get-Date).AddSeconds(20)
  do {Start-Sleep -Milliseconds 200;$proc.Refresh()} while($proc.MainWindowHandle -eq [IntPtr]::Zero -and -not $proc.HasExited -and (Get-Date) -lt $until)
  if($proc.HasExited -or $proc.MainWindowHandle -eq [IntPtr]::Zero){throw 'Installer did not open a captureable window'}
  Start-Sleep -Milliseconds 600
  if($Advance){
   [LaapInstallerCapture]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
   [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
   Start-Sleep -Milliseconds 700
  }
  $rect=New-Object LaapInstallerCapture+RECT
  if(-not [LaapInstallerCapture]::GetWindowRect($proc.MainWindowHandle,[ref]$rect)){throw 'Unable to read installer bounds'}
  $bmp=New-Object System.Drawing.Bitmap(($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
  $graphics=[System.Drawing.Graphics]::FromImage($bmp);$dc=$graphics.GetHdc()
  try {if(-not [LaapInstallerCapture]::PrintWindow($proc.MainWindowHandle,$dc,2)){throw 'Windows installer rendering failed'}} finally {$graphics.ReleaseHdc($dc);$graphics.Dispose()}
  try {$bmp.Save((Join-Path (Resolve-Path $Output).Path "$Name.png"),[System.Drawing.Imaging.ImageFormat]::Png)} finally {$bmp.Dispose()}
 } finally {if(-not $proc.HasExited){$proc.Kill();$proc.WaitForExit()}}
}
Capture-Page 'welcome'
$installDir=Join-Path $env:RUNNER_TEMP 'laap-installer-visual-test'
$install=Start-Process -FilePath $Installer -ArgumentList @('/S',"/D=$installDir") -PassThru -Wait
if($install.ExitCode -ne 0){throw "Test installation failed with exit code $($install.ExitCode)"}
Get-Process | Where-Object {$_.Path -and $_.Path.StartsWith($installDir,[System.StringComparison]::OrdinalIgnoreCase)} | Stop-Process -Force
Capture-Page 'already-installed' -Advance
