import json
import os
import argparse
import requests
import base64
import re
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

def load_config():
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"設定ファイルの読み込みに失敗しました: {e}")
        return None

def fetch_all_episodes_graphql(channel_id, limit=None):
    url = "https://stand.fm/api/graphql"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/json"
    }
    encoded_id = base64.b64encode(f"Channel:{channel_id}".encode()).decode()
    query = """
    query ChannelEpisodesFragmentPaginationQuery($after: String, $first: Int = 50, $id: ID!) {
      node(id: $id) { ... on Channel {
          episodes(first: $first, after: $after) {
            edges { node { episodeId, title, totalDuration, publishedAt, isSupporterOnly } }
            pageInfo { endCursor, hasNextPage }
          }
      }}
    }
    """
    episodes = []
    has_next = True
    after = None
    page = 1

    print("📡 GraphQL APIからエピソード一覧を一括取得中...")
    while has_next:
        variables = {"id": encoded_id, "first": 50}
        if after: variables["after"] = after
        
        resp = requests.post(url, json={"query": query, "variables": variables}, headers=headers)
        if resp.status_code != 200: break
        
        data = resp.json()
        try:
            ep_data = data["data"]["node"]["episodes"]
            for edge in ep_data["edges"]:
                node = edge["node"]
                episodes.append({
                    "id": node["episodeId"],
                    "title": node["title"],
                    "duration_ms": node["totalDuration"],
                    "published": datetime.fromtimestamp(node["publishedAt"]/1000).strftime("%Y-%m-%d"),
                    "is_supporter_only": node.get("isSupporterOnly", False),
                    "link": f"https://stand.fm/episodes/{node['episodeId']}",
                    "index": len(episodes) + 1
                })
            
            pageInfo = ep_data["pageInfo"]
            has_next = pageInfo.get("hasNextPage", False)
            after = pageInfo.get("endCursor")
            print(f"  ... ページ {page} 取得完了 (現在 {len(episodes)} 件)")
            page += 1
            
            if limit and len(episodes) >= limit:
                episodes = episodes[:limit]
                break
        except Exception as e:
            print("GraphQLレスポンスの解析に失敗しました:", e)
            break
            
    return episodes

def fetch_episode_details(episode):
    # HTMLから音声URLと概要を取得する
    if episode.get("is_supporter_only"):
        return episode
        
    url = episode["link"]
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        html = requests.get(url, headers=headers, timeout=15).text
        # audio tag or cdn link
        auth_match = re.search(r'<audio[^>]*src="([^"]*\.m4a)"', html)
        if not auth_match:
            auth_match = re.search(r'(https://cdncf\.stand\.fm/audios/[^"\s]+\.m4a)', html)
        episode["audio_url"] = auth_match.group(1) if auth_match else None
        
        # meta description
        desc_match = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
        if not desc_match:
            desc_match = re.search(r'<meta\s+property="og:description"\s+content="([^"]*)"', html)
        
        # HTMLエスケープの簡易デコード
        desc = desc_match.group(1) if desc_match else ""
        desc = desc.replace("&amp;", "&").replace("&quot;", '"').replace("&#x27;", "'").replace("&lt;", "<").replace("&gt;", ">")
        episode["description"] = desc
    except Exception:
        episode["audio_url"] = None
        episode["description"] = ""
        
    return episode

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, help="取得するエピソードの最大数")
    parser.add_argument("--output", type=str, default="web/public/episodes.json")
    args = parser.parse_args()

    config = load_config()
    if not config or 'channel_url' not in config:
        print("エラー: config.json に channel_url が設定されていません。")
        return

    # Extract ID
    match = re.search(r"channels/([a-f0-9]+)", config['channel_url'])
    channel_id = match.group(1) if match else config['channel_url']
    
    output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), args.output)

    # 既存データのロード（差分更新用）
    existing_data_map = {}
    if os.path.exists(output_path):
        try:
            with open(output_path, 'r', encoding='utf-8') as f:
                existing_json = json.load(f)
                for ep in existing_json.get("episodes", []):
                    # 詳細情報（audio_urlまたはdescription）が含まれているものをキャッシュとして扱う
                    if "audio_url" in ep or "description" in ep:
                        existing_data_map[ep["id"]] = ep
        except json.JSONDecodeError:
            print("  ⚠️ 既存のJSONファイルの読み込みに失敗しました。全件取得します。")
    
    episodes = fetch_all_episodes_graphql(channel_id, limit=args.limit)

    # 取得すべき対象（まだ詳細がない新着エピソードなど）を抽出
    episodes_to_fetch = []
    for ep in episodes:
        if ep["id"] in existing_data_map:
            # 既に詳細取得済みの場合は既存データを反映
            existing_ep = existing_data_map[ep["id"]]
            ep["audio_url"] = existing_ep.get("audio_url")
            ep["description"] = existing_ep.get("description", "")
        else:
            episodes_to_fetch.append(ep)

    if episodes_to_fetch:
        print(f"\n🔍 新着・未取得の {len(episodes_to_fetch)} 件の詳細データ（要約・音声リンク）を並行取得中...")
        completed = 0
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = {executor.submit(fetch_episode_details, ep): ep for ep in episodes_to_fetch}
            for future in as_completed(futures):
                future.result()  # update in place
                completed += 1
                if completed % 50 == 0 or completed == len(episodes_to_fetch):
                    print(f"  ... {completed} / {len(episodes_to_fetch)} 件 完了")
    else:
        print("\n✅ 新しく詳細データを取得すべきエピソードはありませんでした。（すべて取得済み）")

    export_data = {
        "channel_id": channel_id,
        "episodes": episodes
    }
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ {len(episodes)} 件のエピソードデータを {output_path} に保存しました！")

if __name__ == "__main__":
    main()
