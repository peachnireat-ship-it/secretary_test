#!/usr/bin/env bash
LOG_DIR="/c/Users/user/.claude/logs"
mkdir -p "$LOG_DIR"

input=$(cat)
tool_name=$(echo "$input" | grep -o '"tool_name":"[^"]*"' | cut -d'"' -f4)
session_id=$(echo "$input" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
timestamp=$(date '+%Y-%m-%d %H:%M:%S')

# 날짜별 로그 파일
LOG_FILE="$LOG_DIR/usage-$(date '+%Y-%m-%d').log"

echo "[$timestamp] tool=$tool_name session=${session_id:0:8}" >> "$LOG_FILE"

# 월별 통계 집계
STATS_FILE="$LOG_DIR/stats-$(date '+%Y-%m').tsv"
if [ -n "$tool_name" ]; then
  existing=$(grep -c "tool=$tool_name" "$LOG_FILE" 2>/dev/null || echo 0)
  echo -e "$timestamp\t$tool_name\t$existing" >> "$STATS_FILE"
fi

exit 0
