Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd.exe /c cd /d """ & scriptDir & """ && npm run bot >> bot.log 2>&1", 0, False
