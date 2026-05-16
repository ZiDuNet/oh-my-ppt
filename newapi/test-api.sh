#!/bin/bash
# NewAPI 接口测试脚本
# Base URL: https://new-api.chaoxi.live
# Version: v0.12.9

BASE_URL="https://new-api.chaoxi.live"
USERNAME="testuser_cx"
PASSWORD="Test123456"
EMAIL="test_cx@test.com"

echo "===== 1. 注册 ====="
curl -s -X POST "$BASE_URL/api/user/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"email\":\"$EMAIL\"}" | jq .

echo ""
echo "===== 2. 登录 ====="
LOGIN_RESP=$(curl -s -c - -X POST "$BASE_URL/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
echo "$LOGIN_RESP" | jq .

# 提取 user id
USER_ID=$(echo "$LOGIN_RESP" | jq -r '.data.id')
echo "User ID: $USER_ID"

# 提取 session cookie（需要手动从 cookie jar 获取）
echo ""
echo "===== 3. 登录（获取 session） ====="
SESSION=$(curl -s -D - -X POST "$BASE_URL/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  | grep -i "set-cookie" | sed 's/Set-Cookie: //;s/;.*//')
echo "Session: $SESSION"

echo ""
echo "===== 4. 获取用户信息 ====="
curl -s -X GET "$BASE_URL/api/user/self" \
  -H "Cookie: $SESSION" \
  -H "New-Api-User: $USER_ID" | jq .

echo ""
echo "===== 5. 登出 ====="
curl -s -X GET "$BASE_URL/api/user/logout" \
  -H "Cookie: $SESSION" \
  -H "New-Api-User: $USER_ID" | jq .
