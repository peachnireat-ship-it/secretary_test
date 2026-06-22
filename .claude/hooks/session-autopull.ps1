# 세션당 1회만 실행 (PID 기반 마커)
$marker = "$env:TEMP\claude_session_$PID.lock"
if (Test-Path $marker) { exit 0 }
New-Item -ItemType File -Path $marker -Force | Out-Null

$repoPath = "C:\Users\user"

# 리모트 변경 확인
git -C $repoPath fetch origin 2>&1 | Out-Null
$behind = (git -C $repoPath rev-list "HEAD..origin/master" --count 2>$null).Trim()

if ([int]$behind -gt 0) {
    Write-Host "[$behind 커밋 뒤처짐] 자동 pull 중..."
    git -C $repoPath pull origin master 2>&1
    Write-Host "업데이트 완료"
} else {
    Write-Host "최신 상태입니다"
}
