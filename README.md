# キズキノ學校 音声ダウンロードツール

stand.fmの「キズキノ學校」チャンネルから音声をダウンロードし、
NotebookLMにソースとして直接アップロードするためのツールです。

## セットアップ

```bash
cd ~/kizukino-gakkou
source venv/bin/activate
```

> 仮想環境 `venv` は構築済みです。

## 使い方

### エピソード一覧を表示
```bash
python -m src.main list
```

### 音声をダウンロード
```bash
# 未処理のエピソードをダウンロード
python -m src.main download

# 全エピソードをダウンロード
python -m src.main download --all

# 特定のエピソードをダウンロード（番号はlistで確認）
python -m src.main download --episode 1
```

### NotebookLMにアップロード

ダウンロードした音声ファイル（`.m4a`）を **NotebookLM** にそのままアップロードできます：

1. [NotebookLM](https://notebooklm.google.com/) を開く
2. 新しいノートブックを作成（または既存のを開く）
3. **ソースを追加** → **音声ファイル** を選択
4. `downloads/` フォルダ内の `.m4a` ファイルを選択

> NotebookLMがGoogleの高精度文字起こしを自動的に行います。

### Google Drive経由でアップロード（オプション）

Google Driveのフォルダに自動アップロードすることも可能です：

1. `setup_guide.md` に従ってGoogle Cloudを設定
2. `config.json` の `google_drive_folder_id` を設定
3. `python -m src.main upload` を実行

## ファイル構成

```
downloads/     ← ダウンロードされた音声ファイル（.m4a）
src/
  main.py      ← CLIスクリプト
  scraper.py   ← stand.fmからエピソード取得
  rss_parser.py  ← RSSフィード解析（オプション）
  audio_downloader.py ← 音声DL
  gdrive_uploader.py  ← Google Driveアップロード
```
