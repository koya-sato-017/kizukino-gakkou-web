"""
Google Docsアップロードモジュール

文字起こしテキストをGoogle Docsとして指定フォルダに保存する。
"""

import os

from google.oauth2 import service_account
from googleapiclient.discovery import build


SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]


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


def upload_to_google_docs(
    transcript_path: str,
    title: str,
    published_date: str,
    credentials_path: str,
    folder_id: str,
) -> str:
    """
    文字起こしテキストをGoogle Docsとしてアップロードする。

    Args:
        transcript_path: 文字起こしテキストファイルのパス
        title: ドキュメントのタイトル
        published_date: 配信日
        credentials_path: サービスアカウントのJSONキーファイルパス
        folder_id: Google DriveのフォルダID

    Returns:
        str: 作成されたGoogle DocsのURL
    """
    credentials = _get_credentials(credentials_path)

    # テキストを読み込み
    with open(transcript_path, "r", encoding="utf-8") as f:
        content = f.read()

    doc_title = f"【キズキノ學校】{title}（{published_date}）"

    # Google Drive API でGoogle Docsファイルを作成
    drive_service = build("drive", "v3", credentials=credentials)

    file_metadata = {
        "name": doc_title,
        "mimeType": "application/vnd.google-apps.document",
        "parents": [folder_id],
    }

    # まずテキストファイルをGoogle Docs形式でアップロード
    from googleapiclient.http import MediaFileUpload

    media = MediaFileUpload(
        transcript_path,
        mimetype="text/plain",
        resumable=True,
    )

    file = (
        drive_service.files()
        .create(
            body=file_metadata,
            media_body=media,
            fields="id, webViewLink",
        )
        .execute()
    )

    doc_url = file.get("webViewLink", f"https://docs.google.com/document/d/{file['id']}")

    print(f"  📄 Google Docsに保存しました: {doc_title}")
    print(f"     URL: {doc_url}")

    return doc_url


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
