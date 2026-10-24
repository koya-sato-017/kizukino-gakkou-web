"""stand.fmの全件一覧を検証し、正常なスナップショットだけを公開用に保存する。"""

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import tempfile

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "web/public/episodes.json"
DEFAULT_CHANNEL = "606297aabe8d4428b912db34"
JST = timezone(timedelta(hours=9))
QUERY = """
query ChannelEpisodesFragmentPaginationQuery($after: String, $first: Int = 50, $id: ID!) {
  node(id: $id) { ... on Channel {
    episodes(first: $first, after: $after) {
      edges { node { episodeId title totalDuration publishedAt isSupporterOnly } }
      pageInfo { endCursor hasNextPage }
    }
  }}
}
"""


class ExportError(Exception):
    """公開を止めるべき取得・検証エラー。"""


def now_iso():
    return datetime.now(JST).isoformat(timespec="seconds")


def make_session():
    session = requests.Session()
    # POSTは読み取り専用のGraphQLクエリにだけ使用する。
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=["GET", "POST"])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update({"User-Agent": "Mozilla/5.0 (KizukinoGakkou archive)"})
    return session


def load_json(path):
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or not isinstance(data.get("episodes"), list):
        raise ExportError(f"既存データの形式が不正です: {path}")
    return data


def channel_id_from(value):
    match = re.fullmatch(r"(?:https://stand\.fm/channels/)?([a-f0-9]{24})/?", value)
    if not match:
        raise ExportError("チャンネルIDまたはstand.fmのチャンネルURLが不正です")
    return match.group(1)


def fetch_all_episodes_graphql(channel_id, limit=None, session=None):
    """全ページの成功を必須とし、途中までの取得結果を成功として返さない。"""
    if session is None:
        with make_session() as client:
            return fetch_all_episodes_graphql(channel_id, limit, client)
    encoded = base64.b64encode(f"Channel:{channel_id}".encode()).decode()
    episodes, ids, cursors = [], set(), set()
    after = None
    for page in range(1, 1001):
        response = session.post("https://stand.fm/api/graphql", json={
            "query": QUERY, "variables": {"id": encoded, "first": 50, "after": after},
        }, timeout=(10, 30))
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or payload.get("errors"):
            raise ExportError(f"GraphQLエラー (ページ{page})")
        try:
            connection = payload["data"]["node"]["episodes"]
            edges, info = connection["edges"], connection["pageInfo"]
            if not isinstance(edges, list) or type(info["hasNextPage"]) is not bool:
                raise ValueError("ページ情報が不正")
            if not edges and info["hasNextPage"]:
                raise ValueError("空のページが続いている")
            for edge in edges:
                node = edge["node"]
                episode_id = node["episodeId"]
                if not isinstance(episode_id, str) or not re.fullmatch(r"[a-f0-9]{24}", episode_id):
                    raise ValueError("放送IDが不正")
                if episode_id in ids:
                    raise ValueError("放送IDが重複")
                if not isinstance(node["title"], str) or not node["title"].strip():
                    raise ValueError("タイトルが空")
                if type(node["isSupporterOnly"]) is not bool:
                    raise ValueError("限定公開の情報が不正")
                if type(node["publishedAt"]) not in (int, float) or node["publishedAt"] <= 0:
                    raise ValueError("配信日時が不正")
                published = datetime.fromtimestamp(node["publishedAt"] / 1000, JST)
                if published > datetime.now(JST) + timedelta(minutes=5):
                    raise ValueError("未公開の配信日時")
                duration = node["totalDuration"]
                if type(duration) not in (int, float) or duration < 0:
                    raise ValueError("再生時間が不正")
                ids.add(episode_id)
                episodes.append({
                    "id": episode_id, "title": node["title"], "duration_ms": duration,
                    "published": published.strftime("%Y-%m-%d"),
                    "published_at": published.isoformat(timespec="milliseconds"),
                    "is_supporter_only": node["isSupporterOnly"],
                    "link": f"https://stand.fm/episodes/{episode_id}",
                })
            print(f"ページ{page}: {len(episodes)}件取得", flush=True)
            if limit and len(episodes) >= limit:
                return sorted(episodes, key=lambda ep: ep["published_at"], reverse=True)[:limit]
            if not info["hasNextPage"]:
                return sorted(episodes, key=lambda ep: ep["published_at"], reverse=True)
            after = info["endCursor"]
            if not isinstance(after, str) or not after or after in cursors:
                raise ValueError("ページ送りが停止")
            cursors.add(after)
        except (KeyError, TypeError, ValueError, OverflowError, OSError) as error:
            raise ExportError(f"一覧の解析に失敗 (ページ{page}): {error}") from error
    raise ExportError("ページ数が上限を超えました")


def validate_snapshot(episodes, previous=None, allow_large_removal=False):
    if not episodes:
        raise ExportError("取得結果が0件のため更新を中止しました")
    old = (previous or {}).get("episodes", [])
    if old and not allow_large_removal:
        missing = {ep["id"] for ep in old} - {ep["id"] for ep in episodes}
        if len(missing) > max(5, len(old) * 0.05):
            raise ExportError(f"既存の{len(missing)}件が消失しています。全件確認後に再実行してください")
        if max(ep["published"] for ep in episodes) < max(ep["published"] for ep in old):
            raise ExportError("最新配信日が過去に戻るため更新を中止しました")


class EpisodeHTML(HTMLParser):
    """属性の順番や引用符に依存せず、公式ページの情報を取り出す。"""

    def __init__(self):
        super().__init__()
        self.description = ""
        self.audio_url = None
        self.next_data = []
        self.in_next_data = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and (attrs.get("name") or attrs.get("property")) in ("description", "og:description"):
            self.description = self.description or attrs.get("content", "")
        if tag in ("audio", "source") and attrs.get("src", "").startswith("https://"):
            self.audio_url = attrs["src"]
        if tag == "script" and attrs.get("id") == "__NEXT_DATA__":
            self.in_next_data = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_next_data = False

    def handle_data(self, data):
        if self.in_next_data:
            self.next_data.append(data)


def find_episode_object(value, episode_id):
    if isinstance(value, dict):
        if (value.get("id") == episode_id or value.get("episodeId") == episode_id) and any(
            key in value for key in ("description", "audioUrl", "audio")
        ):
            return value
        for child in value.values():
            result = find_episode_object(child, episode_id)
            if result is not None:
                return result
    elif isinstance(value, list):
        for child in value:
            result = find_episode_object(child, episode_id)
            if result is not None:
                return result
    return None


def fetch_episode_details(episode):
    result = dict(episode)
    try:
        with make_session() as client:
            response = client.get(episode["link"], timeout=(10, 25))
            response.raise_for_status()
        parser = EpisodeHTML()
        parser.feed(response.text)
        description, audio = parser.description, parser.audio_url
        if parser.next_data:
            obj = find_episode_object(json.loads("".join(parser.next_data)), episode["id"])
            if obj:
                # 一覧取得後に限定化された放送の内容を保存しない。
                if obj.get("isSupporterOnly") is True:
                    result.update(is_supporter_only=True, description="", audio_url=None,
                                  details_checked_at=now_iso(), details_status="ok")
                    return result
                description = obj.get("description") or description
                audio = obj.get("audioUrl") or audio
        if not audio:
            match = re.search(r'https://cdncf\.stand\.fm/audios/[^"\s<>]+?\.m4a(?:\?[^"\s<>]*)?', response.text)
            audio = unescape(match.group(0)) if match else None
        if not isinstance(audio, str) or not audio.startswith("https://"):
            raise ExportError("音声URLを取得できませんでした")
        if not isinstance(description, str):
            raise ExportError("概要の形式が不正です")
        result.update(audio_url=audio, description=unescape(description),
                      details_checked_at=now_iso(), details_status="ok")
    except (requests.RequestException, ValueError, ExportError) as error:
        # 失敗時刻も保存して、同じ放送だけを毎回取得することを防ぐ。
        result.update(details_checked_at=now_iso(), details_status="retry")
        print(f"詳細取得を再試行予定: {episode['id']} ({type(error).__name__})", flush=True)
    return result


def refresh_details(episodes, previous, budget=40, workers=4):
    cached = {ep["id"]: ep for ep in (previous or {}).get("episodes", [])}
    candidates = []
    current = datetime.now(JST)
    for episode in episodes:
        old = cached.get(episode["id"], {})
        if episode["is_supporter_only"]:
            episode.update(description="", audio_url=None)
            continue
        # 限定放送だった回のキャッシュを公開回に流用しない。
        if not old.get("is_supporter_only"):
            for key in ("description", "audio_url", "details_checked_at", "details_status"):
                if key in old:
                    episode[key] = old[key]
        episode.setdefault("description", "")
        episode.setdefault("audio_url", None)
        checked = episode.get("details_checked_at")
        try:
            last = datetime.fromisoformat(checked) if checked else None
            if last and last.tzinfo is None:
                last = None
        except (TypeError, ValueError):
            last = None
        missing = not episode["audio_url"] or not episode["description"]
        interval = timedelta(hours=6) if episode.get("details_status") == "retry" else timedelta(days=7)
        if not old or not last or current - last >= interval:
            # 新着→欠損→古い確認日の順にし、負荷を分散する。
            candidates.append(((0 if not old else 1 if missing else 2, checked or ""), episode))
    targets = [ep for _, ep in sorted(candidates, key=lambda pair: pair[0])[:budget]]
    print(f"詳細取得: {len(targets)}件 (同時接続{workers})", flush=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        updated = {ep["id"]: ep for ep in pool.map(fetch_episode_details, targets)}
    failures = sum(ep.get("details_status") == "retry" for ep in updated.values())
    if targets and failures == len(targets):
        raise ExportError("詳細取得が全件失敗したため、既存データを維持します")
    return [updated.get(ep["id"], ep) for ep in episodes], failures


def atomic_write(path, data):
    """書き込み中の中断でも直前の正常なJSONを壊さない。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".episodes-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channel", help="チャンネルIDまたはURL (環境変数STANDFM_CHANNEL_IDも可)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, help="確認用の件数制限。別の出力先を必ず指定")
    parser.add_argument("--detail-budget", type=int, default=40)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--allow-large-removal", action="store_true", help="確認済みの大量削除・最新回削除を許可")
    args = parser.parse_args(argv)
    if args.limit is not None and (args.limit < 1 or args.output.resolve() == DEFAULT_OUTPUT.resolve()):
        parser.error("--limit は正数かつ本番と異なる --output が必要です")
    if not 1 <= args.detail_budget <= 200 or not 1 <= args.workers <= 4:
        parser.error("詳細取得件数は1〜200、同時接続は1〜4を指定してください")
    try:
        channel = args.channel or os.environ.get("STANDFM_CHANNEL_ID")
        if not channel:
            config = ROOT / "config.json"
            channel = json.loads(config.read_text(encoding="utf-8")).get("channel_url") if config.exists() else DEFAULT_CHANNEL
        channel = channel_id_from(channel or DEFAULT_CHANNEL)
        previous = load_json(args.output)
        if previous and previous.get("channel_id") != channel:
            raise ExportError("保存済みデータのチャンネルが異なります")
        episodes = fetch_all_episodes_graphql(channel, args.limit)
        validate_snapshot(episodes, previous, args.allow_large_removal)
        episodes, failures = refresh_details(episodes, previous, args.detail_budget, args.workers)
        for index, episode in enumerate(episodes, 1):
            episode["index"] = index
        data = {"channel_id": channel, "updated_at": now_iso(), "detail_failures": failures,
                "latest_published_at": episodes[0]["published_at"], "episodes": episodes}
        atomic_write(args.output, data)
        print(f"保存完了: {len(episodes)}件、最新配信 {episodes[0]['published_at']}", flush=True)
        return 0
    except (ExportError, requests.RequestException, ValueError, OSError) as error:
        print(f"更新中止 (既存データは変更しません): {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
