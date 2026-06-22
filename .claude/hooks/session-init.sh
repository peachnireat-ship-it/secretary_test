#!/usr/bin/env bash
# 세션당 1회만 실행 (PID 마커)
MARKER="/tmp/claude_session_init_$$.lock"
[ -f "$MARKER" ] && exit 0
touch "$MARKER"

REPO="/c/Users/user"
BRANCH=$(git -C "$REPO" branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git -C "$REPO" log --oneline -1 2>/dev/null || echo "unknown")
TODAY=$(date '+%Y-%m-%d')

# 프로젝트 CLAUDE.md 읽기
CLAUDE_CONTENT=""
if [ -f "$REPO/secretary_test/CLAUDE.md" ]; then
  CLAUDE_CONTENT=$(cat "$REPO/secretary_test/CLAUDE.md")
fi

cat <<EOF
## 세션 컨텍스트 (자동 주입)
- 날짜: $TODAY
- 브랜치: $BRANCH
- 최근 커밋: $LAST_COMMIT
- 기본 작업 폴더: secretary_test
- git 경로: C:\Users\user

${CLAUDE_CONTENT:+CLAUDE.md 내용:
$CLAUDE_CONTENT}
EOF
