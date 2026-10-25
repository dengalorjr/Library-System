@echo off
chcp 65001 >nul
title Build Library System
echo ===== بناء البرنامج (يحتاج انترنت مرة واحدة على جهازك أنت فقط) =====
where python >nul 2>nul || (echo Python غير مثبت. ثبته من python.org مع تفعيل Add to PATH & pause & exit /b)
python -m pip install --upgrade pip pyinstaller pywebview || (echo فشل التثبيت & pause & exit /b)
python -m PyInstaller --noconsole --onefile --clean --name LibrarySystem --icon icon.ico --add-data "static;static" app.py || (echo فشل البناء & pause & exit /b)
echo.
echo تم! البرنامج الجاهز: dist\LibrarySystem.exe  (انسخه الى جهاز العميل وانشئ له اختصارا على سطح المكتب)
pause
