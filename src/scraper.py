"""
stand.fm スクレイパーモジュール

stand.fmの内部APIとエピソードページから
エピソード情報と音声URLを取得する。
RSSフィードが利用できない場合のフォールバック。
"""

import re
import time
from datetime import datetime

import requests


BASE_URL = "https://stand.fm"
API_URL = f"{BASE_URL}/api"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}

# リクエスト間隔（秒）- サーバーに負荷をかけないため
REQUEST_DELAY = 1.0


def fetch_channel_episodes(channel_id: str) -> list[dict]:
    """
    stand.fmの内部APIからチャンネルのエピソード一覧を取得する。

    Args:
        channel_id: stand.fmのチャンネルID

    Returns:
        list[dict]: エピソード情報のリスト
    """
    url = f"{API_URL}/channels/{channel_id}"
    response = requests.get(url, headers=HEADERS, timeout=15)
    response.raise_for_status()

    data = response.json()
    resp = data.get("response", {})
    episodes_dict = resp.get("episodes", {})

    episodes = []
    for i, (ep_id, ep_data) in enumerate(episodes_dict.items()):
        # ミリ秒のタイムスタンプを日付に変換
        published_ms = ep_data.get("publishedAt", ep_data.get("createdAt", 0))
        if published_ms:
            pub_date = datetime.fromtimestamp(published_ms / 1000).strftime("%Y-%m-%d")
        else:
            pub_date = "不明"

        episodes.append(
            {
                "index": i + 1,
                "id": ep_data.get("id", ep_id),
                "title": ep_data.get("title", "タイトル不明"),
                "published": pub_date,
                "description": ep_data.get("description", ""),
                "duration_ms": ep_data.get("totalDuration", 0),
                "link": f"{BASE_URL}/episodes/{ep_data.get('id', ep_id)}",
                "audio_url": None,  # 後でHTMLから取得
                "is_supporter_only": ep_data.get("isSupporterOnly", False),
            }
        )

    # 公開日で新しい順にソート
    episodes.sort(key=lambda x: x["published"], reverse=True)

    # インデックスを振り直し
    for i, ep in enumerate(episodes):
        ep["index"] = i + 1

    return episodes


def fetch_audio_url(episode_id: str) -> "str | None":
    """
    エピソードページのHTMLから音声URLを取得する。

    Args:
        episode_id: stand.fmのエピソードID

    Returns:
        str | None: 音声ファイルのURL（.m4a）、取得できない場合はNone
    """
    url = f"{BASE_URL}/episodes/{episode_id}"

    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"  ⚠️ エピソードページの取得に失敗: {e}")
        return None

    html = response.text

    # <audio> タグからURLを取得
    audio_match = re.search(r'<audio[^>]*src="([^"]*\.m4a)"', html)
    if audio_match:
        return audio_match.group(1)

    # 正規表現でCDNの.m4a URLを取得
    m4a_matches = re.findall(
        r'(https://cdncf\.stand\.fm/audios/[^"\s]+\.m4a)', html
    )
    if m4a_matches:
        return m4a_matches[0]

    return None


def fetch_episodes_with_audio(
    channel_id: str, limit: int = None
) -> list[dict]:
    """
    チャンネルのエピソード一覧を取得し、各エピソードの音声URLも取得する。

    Args:
        channel_id: stand.fmのチャンネルID
        limit: 取得するエピソード数の上限（Noneなら全件）

    Returns:
        list[dict]: 音声URL付きのエピソード情報リスト
    """
    print("📡 チャンネル情報を取得中...")
    episodes = fetch_channel_episodes(channel_id)

    if limit:
        episodes = episodes[:limit]

    print(f"  {len(episodes)}件のエピソードが見つかりました")
    print("  音声URLを取得中...")

    for i, ep in enumerate(episodes):
        if ep.get("is_supporter_only"):
            print(f"  ⏭️ [{i+1}/{len(episodes)}] サポーター限定のためスキップ: {ep['title']}")
            continue

        audio_url = fetch_audio_url(ep["id"])
        ep["audio_url"] = audio_url

        if audio_url:
            print(f"  ✅ [{i+1}/{len(episodes)}] {ep['title']}")
        else:
            print(f"  ⚠️ [{i+1}/{len(episodes)}] 音声URL取得失敗: {ep['title']}")

        # サーバーに負荷をかけない
        if i < len(episodes) - 1:
            time.sleep(REQUEST_DELAY)

    return episodes


def extract_channel_id(url_or_id: str) -> str:
    """
    チャンネルURLまたはIDからチャンネルIDを抽出する。

    Args:
        url_or_id: チャンネルURL(https://stand.fm/channels/xxx) またはID

    Returns:
        str: チャンネルID
    """
    # URLの場合
    match = re.search(r"channels/([a-f0-9]+)", url_or_id)
    if match:
        return match.group(1)
    # IDがそのまま渡された場合
    if re.match(r"^[a-f0-9]+$", url_or_id):
        return url_or_id
    raise ValueError(f"無効なチャンネルURLまたはID: {url_or_id}")
