#!/bin/bash
# キズキノ學校 - 自動ダウンロードスクリプト
# launchdから毎朝8時に実行される

LOG_DIR="$HOME/kizukino-gakkou/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/download_$(date +%Y%m%d_%H%M%S).log"

echo "===== $(date) =====" >> "$LOG_FILE"

cd "$HOME/kizukino-gakkou" || exit 1

# 仮想環境を有効化して実行
source venv/bin/activate
python -m src.main download >> "$LOG_FILE" 2>&1

echo "===== 完了: $(date) =====" >> "$LOG_FILE"

# 古いログを30日分だけ保持
find "$LOG_DIR" -name "download_*.log" -mtime +30 -delete
