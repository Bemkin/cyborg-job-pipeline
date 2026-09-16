Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c cd /d ""C:\Users\bemne\.gemini\antigravity-ide\scratch\cyborg-job-pipeline"" && npm run bot >> bot.log 2>&1", 0, False
