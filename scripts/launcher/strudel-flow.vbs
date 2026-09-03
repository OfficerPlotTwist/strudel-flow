' Strudel Flow - Desktop launcher wrapper.
'
' Runs `node scripts/launch-app.mjs` with NO console window. That script starts
' the Vite dev server, waits until it can actually serve the entry module, and
' opens the app in a chromeless Chrome window; see its header for why each of
' those steps is there.
'
' Why a .vbs and not a .bat or a .lnk straight to node: cscript/cmd both flash
' (or park) a console window, and the launcher process has to stay alive for
' the whole session because it owns the dev server and kills it when the app
' window closes. wscript is the only stock Windows host that runs a process
' hidden for its full lifetime.
'
' stdout/stderr go to scripts\launcher\launch.log - hiding the console must not
' also hide the diagnostics.

Option Explicit

Const APP_PORT = 5173
Const LAUNCH_LOCK_SECONDS = 150   ' generous: a cold Vite start can take ~60s
Const EXIT_MARKER = "[launcher] node exited"

Dim fso, sh, here, root, logPath, lockPath, nodeCmd

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

' scripts\launcher\this.vbs -> scripts\launcher -> scripts -> repo root.
here     = fso.GetParentFolderName(WScript.ScriptFullName)
root     = fso.GetParentFolderName(fso.GetParentFolderName(here))
logPath  = here & "\launch.log"
lockPath = here & "\.launching"

' Resolving root wrong is silent and confusing - it presents as the launcher
' hanging on a "dependencies missing" prompt for a directory that was never
' meant to have any. Fail loudly instead.
If Not fso.FileExists(root & "\package.json") Then
  MsgBox "Strudel Flow launcher is not where it expects to be." & vbCrLf & vbCrLf & _
         "Expected a project at: " & root & vbCrLf & _
         "Launcher script: " & WScript.ScriptFullName, vbCritical, "Strudel Flow"
  WScript.Quit 1
End If

' --- Already up? Focus that window instead of opening a second one. ---------
'
' The probe is an HTTP request to the dev server, deliberately NOT a process
' scan: querying Win32_Process for CommandLine hangs indefinitely on this
' machine, and a launcher that hangs is worse than one that opens a duplicate.
If ServerIsHealthy() Then
  On Error Resume Next
  sh.AppActivate "CRT Strudel"
  On Error GoTo 0
  WScript.Quit 0
End If

' --- A cold start already in flight? Do not race it. ------------------------
'
' Vite takes the better part of a minute to become serveable from cold, and
' during that window the server is listening but unhealthy - which is exactly
' the state where launch-app.mjs frees the port by killing whatever holds it.
' A second double-click would therefore shoot down the first launch's server
' and leave that window booting against nothing. The lock file makes the
' second click a no-op instead.
If LaunchInFlight() Then WScript.Quit 0

' --- First run: dependencies. ----------------------------------------------
If Not fso.FolderExists(root & "\node_modules") Then
  If MsgBox("Strudel Flow needs its dependencies installed first." & vbCrLf & vbCrLf & _
            "Run npm install now? This happens once and takes a few minutes.", _
            vbOKCancel Or vbInformation, "Strudel Flow") <> vbOK Then
    WScript.Quit 1
  End If
  ' Visible and blocking on purpose - a multi-minute install with no window is
  ' indistinguishable from a launcher that did nothing.
  sh.CurrentDirectory = root
  sh.Run "cmd /c npm install", 1, True
End If

' --- Launch, hidden, for the life of the session. ---------------------------
TouchLock
sh.CurrentDirectory = root

' The trailing `& echo` runs when node exits, so the log itself records whether
' the process is still alive - no process table lookup required.
nodeCmd = "cmd /c node """ & root & "\scripts\launch-app.mjs"" > """ & logPath & """ 2>&1" & _
          " & echo " & EXIT_MARKER & " >> """ & logPath & """"
sh.Run nodeCmd, 0, False

' A hidden process that dies instantly (node not on PATH, a port clash, a
' broken install) is otherwise a launcher that does nothing at all, forever.
' Give it a moment, and if it has already exited, surface the log.
WScript.Sleep 5000
If LogSaysExited() Then
  fso.DeleteFile lockPath, True
  MsgBox "Strudel Flow could not start." & vbCrLf & vbCrLf & LogTail(1500) & vbCrLf & _
         "Full log: " & logPath, vbExclamation, "Strudel Flow"
End If

' ---------------------------------------------------------------------------

' True when the dev server can serve the app's entry module. Every timeout is
' set explicitly: the default ServerXMLHTTP receive timeout is 30 seconds, and
' a launcher must never stall that long on a port nothing is listening to.
Function ServerIsHealthy()
  Dim http
  ServerIsHealthy = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  If Err.Number <> 0 Then Exit Function
  http.setTimeouts 1000, 1000, 1000, 2000
  http.open "GET", "http://localhost:" & APP_PORT & "/src/main.js", False
  http.setRequestHeader "Cache-Control", "no-store"
  http.send
  If Err.Number = 0 Then ServerIsHealthy = (http.status = 200)
  Err.Clear
End Function

' True when another launch started recently enough to still be booting.
Function LaunchInFlight()
  LaunchInFlight = False
  If Not fso.FileExists(lockPath) Then Exit Function
  On Error Resume Next
  LaunchInFlight = (DateDiff("s", fso.GetFile(lockPath).DateLastModified, Now) < LAUNCH_LOCK_SECONDS)
End Function

Sub TouchLock()
  On Error Resume Next
  fso.CreateTextFile(lockPath, True).WriteLine Now
End Sub

Function LogSaysExited()
  LogSaysExited = (InStr(LogTail(4000), EXIT_MARKER) > 0)
End Function

Function LogTail(maxChars)
  Dim text
  text = ""
  On Error Resume Next
  If fso.FileExists(logPath) Then text = fso.OpenTextFile(logPath, 1).ReadAll()
  On Error GoTo 0
  If text = "" Then text = "(no output)"
  If Len(text) > maxChars Then text = Right(text, maxChars)
  LogTail = text
End Function
