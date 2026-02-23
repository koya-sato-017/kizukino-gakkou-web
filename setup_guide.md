# Google Cloud セットアップガイド

このガイドでは、文字起こしツールでGoogle Docsに自動保存するための設定手順を説明します。

> **💡 Google Docs連携は任意です。** 設定しなくても、文字起こしテキストはローカルに保存されます。

---

## 手順1: Google Cloud プロジェクトを作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 画面上部の「プロジェクトを選択」→「新しいプロジェクト」をクリック
3. プロジェクト名: `kizukino-gakkou`（任意の名前でOK）
4. 「作成」をクリック

## 手順2: APIを有効化

1. 作成したプロジェクトを選択
2. 左メニュー「APIとサービス」→「ライブラリ」をクリック
3. 以下の2つのAPIを検索して、それぞれ「有効にする」をクリック:
   - **Google Drive API**
   - **Google Docs API**

## 手順3: サービスアカウントを作成

1. 左メニュー「APIとサービス」→「認証情報」をクリック
2. 「+ 認証情報を作成」→「サービスアカウント」を選択
3. サービスアカウント名: `kizukino-tool`（任意）
4. 「作成して続行」をクリック
5. ロールの選択はスキップして「完了」をクリック

## 手順4: JSONキーをダウンロード

1. 作成したサービスアカウントのメールアドレスをクリック
2. 「キー」タブをクリック
3. 「鍵を追加」→「新しい鍵を作成」
4. 種類: **JSON** を選択
5. 「作成」をクリック → JSONファイルが自動ダウンロードされます
6. ダウンロードしたファイルを `credentials.json` という名前に変更
7. このプロジェクトのルートフォルダに配置:
   ```
   kizukino-gakkou/
   ├── credentials.json  ← ここに配置
   ├── config.json
   └── ...
   ```

> ⚠️ **credentials.json は機密情報です。** GitHubなどにアップロードしないでください（.gitignoreに設定済み）。

## 手順5: Google Driveでフォルダを作成＆共有

1. [Google Drive](https://drive.google.com/) にアクセス
2. 「キズキノ學校_文字起こし」などの名前でフォルダを新規作成
3. 作成したフォルダを右クリック →「共有」→「共有」
4. サービスアカウントのメールアドレスを入力（例: `kizukino-tool@プロジェクトID.iam.gserviceaccount.com`）
   - メールアドレスは、手順4でダウンロードした `credentials.json` の中の `client_email` に記載されています
5. 役割: 「編集者」を選択
6. 「送信」をクリック

### フォルダIDの確認方法
作成したフォルダをブラウザで開くと、URLが以下のようになります:
```
https://drive.google.com/drive/folders/XXXXXXXXXXXXXXXXXXXXXX
```
この `XXXXXXXXXXXXXXXXXXXXXX` 部分が **フォルダID** です。

## 手順6: config.json を設定

`config.example.json` をコピーして `config.json` を作成し、以下の項目を設定:

```bash
cp config.example.json config.json
```

```json
{
  "rss_url": "RSSフィードのURL",
  "whisper_model": "base",
  "google_credentials_path": "./credentials.json",
  "google_drive_folder_id": "手順5で確認したフォルダID",
  "download_dir": "./downloads",
  "output_dir": "./transcripts"
}
```

## 手順7: 接続テスト

設定が完了したら、以下のコマンドで接続をテスト:

```bash
source venv/bin/activate
python -m src.main check
```

「✅ Google APIへの接続に成功しました」と表示されれば設定完了です！

---

## 💰 費用について

- Google Cloud の無料枠で十分対応できます
- Google Drive API / Docs API は個人利用の範囲内なら無料です
- クレジットカードの登録を求められますが、無料枠を超えない限り課金されません
