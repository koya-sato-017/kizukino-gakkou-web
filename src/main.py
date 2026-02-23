"""
キズキノ學校 音声ダウンロードツール - CLIエントリーポイント

stand.fmの音声配信をダウンロードし、
NotebookLMにソースとして追加するための準備をするツール。

使い方:
    python -m src.main list                  # エピソード一覧を表示
    python -m src.main download              # 未処理のエピソードをダウンロード
    python -m src.main download --all        # 全エピソードをダウンロード
    python -m src.main download --episode 1  # 特定のエピソードをダウンロード
    python -m src.main upload                # DL済み音声をGoogle Driveにアップロード
    python -m src.main check                 # Google API接続を確認
"""

import argparse
import json
import os
import sys

from src.rss_parser import parse_feed, save_processed_episode, load_processed_episodes
from src.scraper import fetch_episodes_with_audio, fetch_audio_url, extract_channel_id
from src.audio_downloader import download_audio
from src.gdrive_uploader import upload_audio_to_drive, check_connection


CONFIG_FILE = "config.json"
PROCESSED_FILE = "processed_episodes.json"


def load_config() -> dict:
    """設定ファイルを読み込む。"""
    if not os.path.exists(CONFIG_FILE):
        print(f"❌ 設定ファイルが見つかりません: {CONFIG_FILE}")
        print(f"   config.example.json をコピーして config.json を作成してください:")
        print(f"   cp config.example.json config.json")
        sys.exit(1)

    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _has_rss(config: dict) -> bool:
    rss_url = config.get("rss_url", "")
    return bool(rss_url) and not rss_url.startswith("ここに")


def _has_channel(config: dict) -> bool:
    ch = config.get("channel_url", "")
    return bool(ch) and not ch.startswith("ここに")


def _get_source_label(config: dict) -> str:
    return "RSS" if _has_rss(config) else "スクレイピング"


def _fetch_episodes(config: dict) -> list[dict]:
    """設定に応じてRSSまたはスクレイピングからエピソードを取得する。"""
    if _has_rss(config):
        print("📡 RSSフィードからエピソードを取得中...")
        return parse_feed(config["rss_url"])
    elif _has_channel(config):
        channel_id = extract_channel_id(config["channel_url"])
        return fetch_episodes_with_audio(channel_id)
    else:
        print("❌ config.json に rss_url または channel_url を設定してください。")
        sys.exit(1)


def cmd_list(config: dict):
    """エピソード一覧を表示する。"""
    episodes = _fetch_episodes(config)

    if not episodes:
        print("  エピソードが見つかりませんでした。")
        return

    source = _get_source_label(config)
    print(f"\n📻 エピソード一覧（全{len(episodes)}件, 取得元: {source}）\n")
    print(f"{'No.':<5} {'配信日':<12} タイトル")
    print("-" * 70)

    for ep in episodes:
        audio_mark = "🔊" if ep["audio_url"] else "⚠️"
        print(f"{ep['index']:<5} {ep['published']:<12} {audio_mark} {ep['title']}")

    processed = load_processed_episodes(PROCESSED_FILE)
    new_count = sum(1 for ep in episodes if ep["title"] not in processed)
    print(f"\n  📌 未処理: {new_count}件 / 全{len(episodes)}件")


def cmd_download(config: dict, process_all: bool = False, episode_num: int = None):
    """エピソードの音声をダウンロードする。"""

    # エピソード取得
    all_episodes = _fetch_episodes(config)

    if episode_num is not None:
        episodes = [ep for ep in all_episodes if ep["index"] == episode_num]
        if not episodes:
            print(f"❌ エピソード #{episode_num} が見つかりません。")
            return
    elif process_all:
        episodes = all_episodes
    else:
        processed = load_processed_episodes(PROCESSED_FILE)
        episodes = [ep for ep in all_episodes if ep["title"] not in processed]

    if not episodes:
        print("✅ ダウンロードするエピソードはありません。")
        return

    # スクレイピングモードで音声URLが未取得のエピソードがあれば取得
    if _has_channel(config) and not _has_rss(config):
        for ep in episodes:
            if not ep.get("audio_url") and not ep.get("is_supporter_only"):
                print(f"  🔍 音声URLを取得中: {ep['title']}")
                ep["audio_url"] = fetch_audio_url(ep["id"])

    print(f"\n🎯 {len(episodes)}件のエピソードをダウンロードします\n")

    download_dir = config.get("download_dir", "./downloads")
    success_count = 0

    for i, ep in enumerate(episodes, 1):
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"  [{i}/{len(episodes)}] {ep['title']}")
        print(f"  配信日: {ep['published']}")
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

        if ep.get("is_supporter_only"):
            print("  ⏭️ サポーター限定のためスキップ\n")
            continue

        if not ep.get("audio_url"):
            print("  ⚠️ 音声URLが見つかりません。スキップ\n")
            continue

        try:
            download_audio(ep["audio_url"], ep["title"], download_dir)
            save_processed_episode(PROCESSED_FILE, ep["title"])
            success_count += 1
            print()
        except Exception as e:
            print(f"  ❌ エラー: {e}\n")
            continue

    print(f"🎉 ダウンロード完了！（成功: {success_count}/{len(episodes)}件）")
    print(f"\n📁 音声ファイルは {download_dir} に保存されています。")
    print("📝 次のステップ:")
    print("   1. NotebookLMを開いてソースに音声ファイルをアップロード")
    print("   2. または python -m src.main upload でGoogle Driveにアップロード")


def cmd_upload(config: dict):
    """ダウンロード済み音声をGoogle Driveにアップロードする。"""
    download_dir = config.get("download_dir", "./downloads")

    if not os.path.exists(download_dir):
        print(f"❌ ダウンロードフォルダが見つかりません: {download_dir}")
        print("   先に python -m src.main download を実行してください。")
        return

    # 音声ファイル一覧
    audio_files = [
        f for f in os.listdir(download_dir)
        if f.endswith((".m4a", ".mp3", ".wav"))
    ]

    if not audio_files:
        print("❌ アップロードする音声ファイルがありません。")
        return

    credentials_path = config.get("google_credentials_path", "")
    folder_id = config.get("google_drive_folder_id", "")

    if not credentials_path or not os.path.exists(credentials_path):
        print("❌ Google認証ファイルが見つかりません。")
        print("   setup_guide.md を参照して設定してください。")
        return

    if not folder_id or folder_id.startswith("ここに"):
        print("❌ google_drive_folder_id が設定されていません。")
        print("   setup_guide.md を参照して設定してください。")
        return

    print(f"📤 {len(audio_files)}件の音声ファイルをGoogle Driveにアップロードします\n")

    for i, filename in enumerate(sorted(audio_files), 1):
        filepath = os.path.join(download_dir, filename)
        print(f"  [{i}/{len(audio_files)}] {filename}")
        try:
            upload_audio_to_drive(filepath, credentials_path, folder_id)
        except Exception as e:
            print(f"  ❌ エラー: {e}")

    print(f"\n🎉 アップロード完了！")
    print("📝 次のステップ:")
    print("   NotebookLMを開き、Google Driveのフォルダから音声ファイルをソースとして追加してください。")


def cmd_check(config: dict):
    """Google APIへの接続を確認する。"""
    print("🔍 Google API接続を確認中...\n")

    credentials_path = config.get("google_credentials_path", "")
    if not credentials_path or credentials_path.startswith("ここに"):
        print("❌ google_credentials_path が設定されていません。")
        print("   setup_guide.md を参照して設定してください。")
        return

    check_connection(credentials_path)


def main():
    parser = argparse.ArgumentParser(
        description="キズキノ學校 音声ダウンロードツール - stand.fm → NotebookLM",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="コマンド")

    # list
    subparsers.add_parser("list", help="エピソード一覧を表示")

    # download
    dl_parser = subparsers.add_parser("download", help="音声をダウンロード")
    dl_parser.add_argument("--all", action="store_true", help="全エピソードをDL")
    dl_parser.add_argument("--episode", type=int, help="エピソード番号を指定")

    # upload
    subparsers.add_parser("upload", help="DL済み音声をGoogle Driveにアップロード")

    # check
    subparsers.add_parser("check", help="Google API接続を確認")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    config = load_config()

    if args.command == "list":
        cmd_list(config)
    elif args.command == "download":
        cmd_download(config, process_all=args.all, episode_num=args.episode)
    elif args.command == "upload":
        cmd_upload(config)
    elif args.command == "check":
        cmd_check(config)


if __name__ == "__main__":
    main()
