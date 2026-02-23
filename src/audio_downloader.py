"""
音声ダウンロードモジュール

RSSフィードから取得した音声URLをダウンロードする。
"""

import os
import re

import requests
from tqdm import tqdm


def sanitize_filename(name: str) -> str:
    """ファイル名に使えない文字を除去する。"""
    # 危険な文字を除去
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    # 空白をアンダースコアに
    name = name.strip().replace(" ", "_")
    # 長すぎるファイル名を短縮
    if len(name) > 100:
        name = name[:100]
    return name


def download_audio(audio_url: str, title: str, download_dir: str) -> str:
    """
    音声ファイルをダウンロードする。

    Args:
        audio_url: 音声ファイルのURL
        title: エピソードのタイトル（ファイル名に使用）
        download_dir: ダウンロード先ディレクトリ

    Returns:
        str: ダウンロードしたファイルのパス
    """
    os.makedirs(download_dir, exist_ok=True)

    # URLから拡張子を推測
    ext = ".mp3"
    if ".m4a" in audio_url:
        ext = ".m4a"
    elif ".wav" in audio_url:
        ext = ".wav"

    safe_title = sanitize_filename(title)
    filepath = os.path.join(download_dir, f"{safe_title}{ext}")

    # 既にダウンロード済みの場合はスキップ
    if os.path.exists(filepath):
        print(f"  ✅ 既にダウンロード済み: {os.path.basename(filepath)}")
        return filepath

    print(f"  📥 ダウンロード中: {title}")

    response = requests.get(audio_url, stream=True, timeout=60)
    response.raise_for_status()

    total_size = int(response.headers.get("content-length", 0))

    with open(filepath, "wb") as f:
        with tqdm(
            total=total_size,
            unit="B",
            unit_scale=True,
            desc="  進捗",
            ncols=70,
        ) as pbar:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                pbar.update(len(chunk))

    print(f"  ✅ ダウンロード完了: {os.path.basename(filepath)}")
    return filepath
