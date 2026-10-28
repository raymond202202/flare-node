#!/bin/sh
# Flare 安装脚本
# 安装到 ~/.flare/install/，与项目文件夹完全分离
# 只用 POSIX sh 语法：FreeBSD 的 base 没有 bash，脚本必须能在 /bin/sh 下跑

set -e

FLARE_HOME="${FLARE_HOME:-$HOME/.flare}"
INSTALL_DIR="$FLARE_HOME/install"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "📦 安装 Flare..."

# 1. 确保 ~/.local/bin 存在
LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"

# 2. 构建项目
echo "🔨 构建中..."
cd "$PROJECT_DIR"
npm run build --silent 2>/dev/null

# 3. 创建安装目录
mkdir -p "$INSTALL_DIR/bin"

# 3.1 前置检查：v0.6.163 起引擎用 Node 内置的 node:sqlite（Node ≥ 22.5，实测 24 稳定）
NODE_OK=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.stdout.write((a>22||(a===22&&b>=5))?"1":"0")' 2>/dev/null || echo 0)
if [ "$NODE_OK" != "1" ]; then
  echo "❌ 需要 Node ≥ 22.5（node:sqlite 内置模块），当前：$(node -v 2>/dev/null || echo 未安装)"
  exit 1
fi

# 4. 复制构建产物（先清空，避免旧编译产物残留成幽灵文件）
echo "📋 复制文件到 $INSTALL_DIR"
rm -rf "$INSTALL_DIR/dist"
mkdir -p "$INSTALL_DIR/dist"
cp -r "$PROJECT_DIR/dist/"* "$INSTALL_DIR/dist/"
cp "$PROJECT_DIR/package.json" "$INSTALL_DIR/"
cp "$PROJECT_DIR/package-lock.json" "$INSTALL_DIR/"

# 5. 生产依赖：用 npm ci 装到 install 目录（不复制、不嵌套、不带 devDeps）
#    旧写法 cp -r node_modules 在目标已存在时会塞出 node_modules/node_modules（实测 +126 MB）
echo "📦 安装生产依赖..."
rm -rf "$INSTALL_DIR/node_modules"
( cd "$INSTALL_DIR" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund )

# 6. 创建启动脚本
cat > "$INSTALL_DIR/bin/flare" << 'WRAPPER'
#!/usr/bin/env node
import('../dist/cli/index.js').catch(e => {
  console.error('Flare 启动失败:', e.message)
  process.exit(1)
})
WRAPPER
chmod +x "$INSTALL_DIR/bin/flare"

# 7. 在 ~/.local/bin/ 创建软链
ln -sf "$INSTALL_DIR/bin/flare" "$LOCAL_BIN/flare"

# 8. 检查 PATH
case ":$PATH:" in
  *":$LOCAL_BIN:"*) ;;
  *)
    echo "⚠️  $LOCAL_BIN 不在 PATH 中，请添加到你的 shell 配置："
    echo "   echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.profile"
    echo "   . ~/.profile"
    ;;
esac

echo ""
echo "✅ Flare 安装完成！"
echo "   项目目录: $PROJECT_DIR"
echo "   安装目录: $INSTALL_DIR"
echo "   命令路径: $LOCAL_BIN/flare"
echo ""
echo "现在可以运行: flare chat -q '你好！'"
echo ""
echo "首次使用别忘了配置 API Key："
echo "   cp $PROJECT_DIR/.env.example $INSTALL_DIR/.env"
echo "   nano $INSTALL_DIR/.env"
