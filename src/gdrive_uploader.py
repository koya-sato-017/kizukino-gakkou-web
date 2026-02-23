"""
Google Driveアップロードモジュール

音声ファイルをGoogle Driveの指定フォルダにアップロードする。
NotebookLMでソースとして追加するため。
"""

import os

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


SCOPES = [
    "https://www.googleapis.com/auth/drive",
]

# MIMEタイプのマッピング
MIME_TYPES = {
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
}


def _get_credentials(credentials_path: str):
    """サービスアカウントの認証情報を取得する。"""
    if not os.path.exists(credentials_path):
        raise FileNotFoundError(
            f"認証ファイルが見つかりません: {credentials_path}\n"
            "setup_guide.md を参照してGoogle Cloudの設定を行ってください。"
        )
    return service_account.Credentials.from_service_account_file(
        credentials_path, scopes=SCOPES
    )


def upload_audio_to_drive(
    audio_path: str,
    credentials_path: str,
    folder_id: str,
) -> str:
    """
    音声ファイルをGoogle Driveにアップロードする。

    Args:
        audio_path: 音声ファイルのパス
        credentials_path: サービスアカウントのJSONキーファイルパス
        folder_id: Google DriveのフォルダID

    Returns:
        str: アップロードされたファイルのURL
    """
    credentials = _get_credentials(credentials_path)
    drive_service = build("drive", "v3", credentials=credentials)

    filename = os.path.basename(audio_path)
    ext = os.path.splitext(filename)[1].lower()
    mime_type = MIME_TYPES.get(ext, "audio/mp4")

    # 同名ファイルが既にフォルダにあるかチェック
    query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    existing = drive_service.files().list(q=query, fields="files(id)").execute()
    if existing.get("files"):
        print(f"  ✅ 既にアップロード済み: {filename}")
        file_id = existing["files"][0]["id"]
        return f"https://drive.google.com/file/d/{file_id}"

    file_metadata = {
        "name": filename,
        "parents": [folder_id],
    }

    media = MediaFileUpload(audio_path, mimetype=mime_type, resumable=True)

    file = (
        drive_service.files()
        .create(body=file_metadata, media_body=media, fields="id, webViewLink")
        .execute()
    )

    url = file.get("webViewLink", f"https://drive.google.com/file/d/{file['id']}")
    print(f"  ✅ アップロード完了: {filename}")
    print(f"     URL: {url}")
    return url


def check_connection(credentials_path: str) -> bool:
    """Google APIへの接続を確認する。"""
    try:
        credentials = _get_credentials(credentials_path)
        drive_service = build("drive", "v3", credentials=credentials)
        drive_service.files().list(pageSize=1).execute()
        print("  ✅ Google APIへの接続に成功しました")
        return True
    except Exception as e:
        print(f"  ❌ Google APIへの接続に失敗しました: {e}")
        return False
