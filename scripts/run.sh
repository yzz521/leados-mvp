#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JAVA_VERSION="$(java -version 2>&1 | head -n 1)"
if ! command -v javac >/dev/null 2>&1; then
  echo "错误：未找到 javac。请安装 JDK 21（建议 Temurin/OpenJDK 21）。" >&2
  exit 1
fi
if ! javac -version 2>&1 | grep -Eq '21|22|23|24|25'; then
  echo "提示：项目使用 JDK 21 编写，检测到：$(javac -version 2>&1)" >&2
fi
BUILD="$ROOT/backend/build/classes"
rm -rf "$BUILD"
mkdir -p "$BUILD"
find "$ROOT/backend/src/main/java" -name '*.java' -print0 | xargs -0 javac -encoding UTF-8 -d "$BUILD"
cp -R "$ROOT/backend/src/main/resources/." "$BUILD/"
cd "$ROOT"
echo "Starting LeadOS MVP — $JAVA_VERSION"
echo "Open http://localhost:${PORT:-8080}"
exec java -cp "$BUILD" com.leados.LeadOsApplication
