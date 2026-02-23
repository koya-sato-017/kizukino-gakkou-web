"""
RSSフィード解析モジュール

stand.fmのRSSフィードからエピソード情報を取得する。
"""

import json
import os
from datetime import datetime

import feedparser


def parse_feed(rss_url: str) -> list[dict]:
    """
    RSSフィードを解析してエピソード一覧を返す。

    Returns:
        list[dict]: 各エピソードの情報（タイトル、公開日、音声URL等）
    """
    feed = feedparser.parse(rss_url)

    if feed.bozo and not feed.entries:
        raise ValueError(f"RSSフィードの解析に失敗しました: {feed.bozo_exception}")

    episodes = []
    for i, entry in enumerate(feed.entries):
        # 音声ファイルのURLを取得
        audio_url = None
        for link in entry.get("links", []):
            if link.get("type", "").startswith("audio/") or link.get("rel") == "enclosure":
                audio_url = link.get("href")
                break

        # enclosuresもチェック
        if not audio_url:
            for enc in entry.get("enclosures", []):
                if enc.get("type", "").startswith("audio/"):
                    audio_url = enc.get("href")
                    break

        # 公開日の解析
        published = entry.get("published", "")
        published_parsed = entry.get("published_parsed")
        if published_parsed:
            pub_date = datetime(*published_parsed[:6]).strftime("%Y-%m-%d")
        else:
            pub_date = published

        episodes.append(
            {
                "index": i + 1,
                "title": entry.get("title", "タイトル不明"),
                "published": pub_date,
                "audio_url": audio_url,
                "summary": entry.get("summary", ""),
                "link": entry.get("link", ""),
            }
        )

    return episodes


def load_processed_episodes(filepath: str) -> set:
    """処理済みエピソードの一覧を読み込む。"""
    if not os.path.exists(filepath):
        return set()
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return set(data.get("processed", []))


def save_processed_episode(filepath: str, episode_title: str):
    """処理済みエピソードを保存する。"""
    processed = load_processed_episodes(filepath)
    processed.add(episode_title)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump({"processed": list(processed)}, f, ensure_ascii=False, indent=2)


def get_new_episodes(rss_url: str, processed_filepath: str) -> list[dict]:
    """未処理のエピソードのみを返す。"""
    all_episodes = parse_feed(rss_url)
    processed = load_processed_episodes(processed_filepath)
    return [ep for ep in all_episodes if ep["title"] not in processed]
