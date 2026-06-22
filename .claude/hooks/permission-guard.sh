#!/usr/bin/env bash
# 읽기 전용 도구는 자동 승인
input=$(cat)
tool_name=$(echo "$input" | grep -o '"tool_name":"[^"]*"' | cut -d'"' -f4)

case "$tool_name" in
  Read|Glob|Grep|LS|WebFetch|WebSearch|TaskGet|TaskList|TaskOutput)
    echo '{"decision": "approve"}'
    ;;
  *)
    exit 0
    ;;
esac
