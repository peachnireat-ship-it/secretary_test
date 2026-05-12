@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: ── 경로 설정 ────────────────────────────────────────
set ROOT=%~dp0
set DOCS=%ROOT%docs
set STATE=%DOCS%\claude.md
set LOG=%DOCS%\claude_log.md
set CHANGE=%DOCS%\CHANGELOG.md

if not exist "%DOCS%" mkdir "%DOCS%"

:: 타임스탬프 (PowerShell, 로케일 무관)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\""') do set TS=%%i

echo.
echo ══════════════════════════════════════════════
echo   SAVE  %TS%
echo ══════════════════════════════════════════════

:: ① 최신 상태 (docs\claude.md 덮어쓰기) ─────────────
echo [1/5] 최신 상태 생성...
claude < "%ROOT%prompt.txt" > "%STATE%"
echo      prompt.txt → docs\claude.md

:: ② 작업 로그 누적 (docs\claude_log.md 추가) ─────────
echo [2/5] 작업 로그 누적...
claude < "%ROOT%prompt.txt" >> "%LOG%"
echo      prompt.txt >> docs\claude_log.md

:: ③ 변경사항 요약 (docs\CHANGELOG.md 생성) ───────────
echo [3/5] 변경사항 요약 생성...
claude "이번 작업 변경사항만 간단한 markdown changelog로 작성해줘" > "%CHANGE%"
echo      docs\CHANGELOG.md 작성 완료

:: ④ Git 자동 커밋 ──────────────────────────────────
echo [4/5] Git 커밋...
git -C "%ROOT%" add -A
git -C "%ROOT%" diff --cached --quiet 2>nul
if errorlevel 1 (
    git -C "%ROOT%" commit -m "save: %TS%"
    echo      커밋 완료
) else (
    echo      변경사항 없음 — 커밋 생략
)

:: ⑤ 결과 확인 ─────────────────────────────────────
echo [5/5] 결과 확인...
echo.
echo ── 최근 커밋 ─────────────────────────────────
git -C "%ROOT%" log --oneline -5
echo.
echo ── docs 폴더 ──────────────────────────────────
dir /b "%DOCS%"
echo.
echo ══════════════════════════════════════════════
echo   완료: %TS%
echo ══════════════════════════════════════════════
echo.

endlocal
pause
