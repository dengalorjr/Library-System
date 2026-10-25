@echo off
chcp 65001 >nul
title Library System
where python >nul 2>nul && (python app.py) || (py app.py)
pause
