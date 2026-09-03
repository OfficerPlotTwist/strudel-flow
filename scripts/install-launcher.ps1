<#
.SYNOPSIS
  Installs (or removes) the "Strudel Flow" Desktop and Start Menu shortcuts.

.DESCRIPTION
  Each shortcut points at wscript.exe with scripts\launcher\strudel-flow.vbs -
  explicitly, rather than at the .vbs itself, because the .vbs association is
  frequently repointed at an editor (or stripped entirely by policy), and a
  shortcut that opens the launcher in Notepad is worse than no shortcut.

.EXAMPLE
  npm run launcher
  npm run launcher -- -Remove
#>
[CmdletBinding()]
param(
  # Remove the shortcuts instead of creating them.
  [switch]$Remove,
  # Skip the Start Menu entry; Desktop only.
  [switch]$NoStartMenu
)

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$vbs     = Join-Path $root 'scripts\launcher\strudel-flow.vbs'
$icon    = Join-Path $root 'scripts\launcher\strudel-flow.ico'
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'

$targets = @([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Strudel Flow.lnk'))
if (-not $NoStartMenu) {
  $programs = [Environment]::GetFolderPath('Programs')
  $targets += [IO.Path]::Combine($programs, 'Strudel Flow.lnk')
}

if ($Remove) {
  foreach ($lnk in $targets) {
    if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force; Write-Host "removed $lnk" }
    else { Write-Host "not present $lnk" }
  }
  exit 0
}

foreach ($required in @($vbs, $icon, $wscript)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "missing required file: $required" }
}

$shell = New-Object -ComObject WScript.Shell
foreach ($lnk in $targets) {
  $parent = Split-Path -Parent $lnk
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath       = $wscript
  $sc.Arguments        = '"{0}"' -f $vbs
  $sc.WorkingDirectory = $root
  $sc.IconLocation     = "$icon,0"
  $sc.Description      = 'CRT Strudel live-coding editor'
  $sc.WindowStyle      = 1
  $sc.Save()
  Write-Host "created $lnk"
}

Write-Host ''
Write-Host 'Launcher installed. Double-click "Strudel Flow" on the Desktop.'
Write-Host "Log: $(Join-Path $root 'scripts\launcher\launch.log')"
