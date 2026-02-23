"""
Whisper文字起こしモジュール

OpenAI Whisperを使ってローカルで音声を文字起こしする。
"""

import os

import whisper


def transcribe_audio(
    audio_path: str,
    output_dir: str,
    model_name: str = "base",
    language: str = "ja",
) -> str:
    """
    音声ファイルを文字起こしする。

    Args:
        audio_path: 音声ファイルのパス
        output_dir: テキスト出力先ディレクトリ
        model_name: Whisperモデル名（base, small, medium, large）
        language: 言語コード

    Returns:
        str: 文字起こしテキストファイルのパス
    """
    os.makedirs(output_dir, exist_ok=True)

    # 出力ファイルパス
    base_name = os.path.splitext(os.path.basename(audio_path))[0]
    output_path = os.path.join(output_dir, f"{base_name}.txt")

    # 既に文字起こし済みの場合はスキップ
    if os.path.exists(output_path):
        print(f"  ✅ 既に文字起こし済み: {os.path.basename(output_path)}")
        return output_path

    print(f"  🎙️ 文字起こし中（モデル: {model_name}）...")
    print(f"     ファイル: {os.path.basename(audio_path)}")
    print(f"     初回はモデルのダウンロードに時間がかかります...")

    # モデル読み込み
    model = whisper.load_model(model_name)

    # 文字起こし実行
    result = model.transcribe(
        audio_path,
        language=language,
        verbose=False,
    )

    # テキストを保存
    text = result["text"]

    # セグメント情報付きのテキストも生成
    segments_text = ""
    for segment in result.get("segments", []):
        start = _format_time(segment["start"])
        end = _format_time(segment["end"])
        segments_text += f"[{start} - {end}] {segment['text'].strip()}\n"

    # ファイルに書き込み
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"# 文字起こし: {base_name}\n\n")
        f.write(f"## 全文\n\n{text}\n\n")
        f.write(f"## タイムスタンプ付き\n\n{segments_text}")

    print(f"  ✅ 文字起こし完了: {os.path.basename(output_path)}")
    return output_path


def _format_time(seconds: float) -> str:
    """秒をHH:MM:SS形式に変換する。"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"
