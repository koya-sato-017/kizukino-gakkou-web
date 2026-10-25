# キズキノ學校 音声ダウンロードツール

公開サイト: https://kizukino-gakkou.pages.dev/

Webサイトは `web/` のReact + TypeScript + Viteで構築しています。stand.fmの放送一覧を毎時取得し、検証・ビルドに成功したデータを公開します。公開先はCloudflare Pagesに統一し、旧GitHub Pagesの公開は停止しています。運用、監視、手動更新、復旧、Cloudflare Pagesへの移行は [OPERATIONS.md](OPERATIONS.md) を参照してください。

Web用の更新処理は `python -m src.export_web_data`、公開確認は `python -m src.check_web_site` です。音声ダウンロードやGoogle連携の設定とは独立しています。Web用の依存は `requirements-web.txt` にまとめています。

シリーズ判定は `web/src/series.ts` で管理し、公開放送が5件以上あるシリーズを表示します。「あんな時代もあったね、と」は括弧内の企画名で判定し、読点や回数表記の違いをまとめます。告知や舞台裏など、本文だけで企画名に触れる放送は含めません。判定の検証はNode.js 24で `cd web` → `npm test` を実行してください。

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
