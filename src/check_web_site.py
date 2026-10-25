"""公開JSONの鮮度と、デプロイしたスナップショットの一致を確認する。"""

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import time
from urllib.parse import urljoin, urlparse

import requests

from src.export_web_data import DEFAULT_CHANNEL, ExportError, make_session


def check_data(data, expected=None, max_age_hours=3, max_episode_age_hours=72, now=None):
    now = now or datetime.now(timezone.utc)
    if not isinstance(data, dict) or data.get("channel_id") != DEFAULT_CHANNEL:
        raise ExportError("公開データのチャンネルが不正です")
    episodes = data.get("episodes")
    if not isinstance(episodes, list) or not episodes:
        raise ExportError("公開一覧が空です")
    updated = datetime.fromisoformat(data.get("updated_at", ""))
    if updated.tzinfo is None or updated > now + timedelta(minutes=5):
        raise ExportError("更新日時が不正です")
    if now - updated > timedelta(hours=max_age_hours):
        raise ExportError(f"取得成功から{max_age_hours}時間以上経過しています")
    ids = [episode["id"] for episode in episodes]
    if len(ids) != len(set(ids)):
        raise ExportError("公開一覧に重複があります")
    public = [episode for episode in episodes if not episode.get("is_supporter_only")]
    if not public:
        raise ExportError("公開放送がありません")
    latest = max(datetime.fromisoformat(ep["published_at"]) for ep in public)
    if latest.tzinfo is None or latest > now + timedelta(minutes=5):
        raise ExportError("最新配信日時が不正です")
    if max_episode_age_hours and now - latest > timedelta(hours=max_episode_age_hours):
        raise ExportError(f"公開放送が{max_episode_age_hours}時間以上更新されていません。配信元も確認してください")
    if expected and (data.get("updated_at") != expected.get("updated_at")
                     or data.get("episodes") != expected.get("episodes")):
        raise ExportError("公開データが今回の更新結果と一致しません")
    if data.get("detail_failures", 0):
        raise ExportError(f"概要・音声URLの取得に{data['detail_failures']}件失敗しています")
    return f"正常: {len(episodes)}件 / 最終取得 {data['updated_at']}"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="https://kizukino-gakkou.pages.dev/")
    parser.add_argument("--expected", type=Path)
    parser.add_argument("--max-age-hours", type=float, default=3)
    parser.add_argument("--max-episode-age-hours", type=float, default=72,
                        help="配信の間隔。0で休止期間の配信遅延検知を無効化")
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--delay", type=float, default=15)
    args = parser.parse_args(argv)
    if urlparse(args.url).scheme not in ("https", "http") or args.attempts < 1:
        parser.error("HTTP(S) URLと1以上の試行回数を指定してください")
    expected = json.loads(args.expected.read_text(encoding="utf-8")) if args.expected else None
    failure = ""
    with make_session() as session:
        for attempt in range(args.attempts):
            try:
                url = urljoin(args.url.rstrip("/") + "/", "episodes.json")
                response = session.get(url, params={"healthcheck": time.time_ns()}, timeout=(10, 30))
                response.raise_for_status()
                print(check_data(response.json(), expected, args.max_age_hours, args.max_episode_age_hours))
                return 0
            except (requests.RequestException, ExportError, ValueError, KeyError, TypeError) as error:
                failure = str(error)
                print(f"公開確認 {attempt + 1}/{args.attempts}: {failure}", flush=True)
                if attempt + 1 < args.attempts:
                    time.sleep(args.delay)
    print(f"公開確認に失敗: {failure}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
