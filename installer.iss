\xef\xbb\xbf[Setup]
AppName=LibrarySystem
AppVersion=1.0
AppPublisher=Library
DefaultDirName={autopf}\LibrarySystem
DefaultGroupName=LibrarySystem
OutputDir=installer
OutputBaseFilename=LibrarySystem-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\LibrarySystem.exe
PrivilegesRequired=lowest
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Tasks]
Name: "desktop"; Description: "Create a desktop shortcut"; Flags: checkedonce

[Files]
Source: "dist\LibrarySystem.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\نظام محاسبة المكتبة"; Filename: "{app}\LibrarySystem.exe"; Tasks: desktop
Name: "{group}\نظام محاسبة المكتبة"; Filename: "{app}\LibrarySystem.exe"

[Run]
Filename: "{app}\LibrarySystem.exe"; Description: "Launch now"; Flags: nowait postinstall skipifsilent
