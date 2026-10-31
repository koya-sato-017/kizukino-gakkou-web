# Webサイトの運用

## 更新の流れ

Cloudflare Worker `kizukino-gakkou-scheduler` のCronが毎時17分にGitHub Actionsの `Update and deploy site` を `workflow_dispatch` で起動する。配信時刻から反映までは通常1時間程度とビルド時間が必要。外部サービスの障害やGitHubの実行待ちによる遅延はあり得る。GitHub側の定期スケジュールは使用しない。

1. stand.fmの全ページを取得する。
2. 放送ID、公開状態、配信日時、ページ送り、既存データとの件数差を検証する。
3. 新着や未取得の詳細を優先し、1回最大40件・同時4接続で概要と音声URLを確認する。
4. 検証済みデータを一時ファイルに書き、正常終了後だけJSONを置き換える。
5. Pythonの回帰テスト、フロントエンドのlintとビルドに成功したらGitにデータを記録し、Cloudflare Pagesへ公開する。
6. 公開URLのJSONと今回のデータを比較する。

一覧取得の途中失敗、0件、ID重複、公開状態の欠損、大幅な既存回の消失、最新配信日の後退は失敗として終了し、既存JSONを維持する。削除は全件一覧の取得が完了した場合だけ反映する。限定化された回の音声URLと概要は公開JSONから除く。

詳細取得の一部失敗では前の概要・音声URLを維持し、6時間後以降に再試行する。新着の音声URLが取れない場合もstand.fmへのリンクは表示できる。詳細取得が全件失敗なら公開を止める。一部失敗は公開後の確認で異常として通知する。既存回の詳細は7日以上経過したものを件数制限内で再確認するため、全放送の再確認が7日以内に完了する保証はない。

## 初期設定

- Cloudflare PagesのDirect Uploadプロジェクトと、後述のActions用認証情報・変数を設定する。GitHub Pagesは公開停止のままにする。
- ワークフローのコードをデフォルトブランチ `main` に置く。
- 定期起動のWorker・Cron・Secretを設定する。設定と認証の詳細は [定期起動Worker](automation/cloudflare-scheduler/README.md) を参照。
- Actions → Update and deploy site → Run workflow から初回を実行する。
- stand.fmの取得には追加の認証情報は不要。Google用の `credentials.json` やローカルの `config.json` は使用しない。
- 自動更新は保存と公開を同じワークフローで行う。`GITHUB_TOKEN` によるpushは別のpushワークフローを起動しないため、push後の別ワークフロー任せにしない。

## 監視と通知

| 確認 | 異常とする条件 |
|---|---|
| 公開直後 | 公開JSONが今回のデータと一致しない、読み込みに失敗、詳細取得の失敗がある |
| 2時間ごとの独立した確認 | 最終取得から3時間超、最新の公開放送から72時間超、JSONが不正 |
| 公開直後と2時間ごと | HTMLのCSP・埋め込み禁止などの保護設定が欠落・変更している |
| 毎週月曜日09:30 (日本時間) | npm・Python依存に既知の脆弱性がある、監査通信が失敗、公開用・定期起動用トークンの期限まで30日以下 |

失敗時は `運用アラート: サイトの自動更新` または `運用アラート: 公開サイトの更新停止` というGitHub Issueを1件だけ作る。回復後に閉じる。失敗が継続しても同じIssueを増やさない。新しい障害は別Issueになる。

Issueの通知を受け取るには、GitHubリポジトリのWatchでIssuesを受信する設定と、個人アカウントの通知設定を確認する。メールやSlackの送信先は未設定。

放送休止も72時間の確認に該当するため、配信元を見て原因を切り分ける。休止中は監視の `--max-episode-age-hours` を伸ばすか、0で配信間隔だけの検知を無効化する。

起動元はCloudflareに分離したが、取得・公開・確認の実処理はGitHub Actions上で動く。GitHub Actions全体が停止すると監視も実行できない。Cloudflare側の起動失敗はCron Events / Workers Logsで確認する。正常時は取得日時を含むコミットが残る。障害が長期化する場合は、公開JSONの `updated_at` とCloudflare・GitHub双方の実行履歴を確認する。

## 手動更新と検証

```bash
python3 -m venv .venv-web
source .venv-web/bin/activate
python -m pip install --require-hashes -r requirements-web.txt
python -m unittest discover -s tests -v
python -m src.export_web_data
cd web
npm ci --ignore-scripts
npm run lint
npm run build
```

少量確認には別ファイルを指定する。本番のJSONへ `--limit` で書き込むことは禁止している。

```bash
python -m src.export_web_data --limit 3 --output /tmp/kizuki-preview.json
python -m src.check_web_site
```

フロントエンドはNode.js 24を基準にする。通常の更新はActionsの手動実行を使い、旧 `deploy.sh` による `gh-pages` ブランチへの公開とは併用しない。

## 障害からの復旧

1. Actionsの失敗した実行と運用アラートIssueを確認する。
2. 通信の一時障害なら `Update and deploy site` を手動実行する。
3. データ不良ならGit履歴から正常だったデータのコミットSHAを選ぶ。
4. 自動取得が復旧版をすぐ置き換えないよう、いったん自動更新ワークフローをDisableする。再度Enableして直ちに手動実行し、`restore_commit` に正常なSHAを指定する。実行後にDisableし、原因修正後にEnableする。
5. 復旧モードでは指定コミットのJSONだけを戻し、現在のコードでビルドする。古いデータの鮮度検知は一時的に免除し、公開データの一致を確認する。監視側の鮮度アラートは復旧まで残る。

復旧用には `updated_at` と `published_at` のある自動更新導入後のデータを選ぶ。検証済みJSONはGit履歴に加えてActionsの `validated-episodes` artifactにも30日間保存する。アプリのコード自体に問題がある場合は、原因のコミットをrevertしてから公開する。

大量削除が意図した変更だと確認できた場合だけ、手元で `--allow-large-removal` を付けて全件取得し、差分を確認してコミットする。定期実行ではこの保護を無効化しない。

## Cloudflare Pagesでの公開

公開先プロジェクト: `kizukino-gakkou`。URL: `https://kizukino-gakkou.pages.dev/`。
Cloudflare PagesのDirect Uploadを使い、取得・検証・ビルドは既存のGitHub Actionsで行う。Git連携によるCloudflare側の再ビルドは使用しない。

### 自動公開の接続

GitHubリポジトリ Settings → Secrets and variables → Actions に以下を設定する。

| 種別 | 名前 | 値 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | 対象CloudflareアカウントのCloudflare Pages編集権限を持つトークン |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | CloudflareのアカウントID |
| Variable | `CLOUDFLARE_SITE_URL` | `https://kizukino-gakkou.pages.dev/` |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | `kizukino-gakkou` |
| Variable | `CLOUDFLARE_TOKEN_EXPIRES_ON` | Cloudflareに表示される実際の失効日 (YYYY-MM-DD) |
| Variable | `SCHEDULER_TOKEN_EXPIRES_ON` | CloudflareからGitHubを起動するキーの実際の失効日 (YYYY-MM-DD) |

トークンの値をコード、ログ、ドキュメントに書かない。アカウントID・URL・プロジェクト名とSecretはすべて必須。設定が不足した場合は公開ジョブを失敗させ、アラートで通知する。

`Update and deploy site` を手動実行し、`deploy-cloudflare` と `verify-cloudflare` の成功を確認する。以後は毎時17分の取得に続いて自動公開する。GitHub Pagesの公開・監視ジョブは削除済みで、Cloudflareだけを更新する。

### ビルドと監視

- 検証済みJSONを使い、 `VITE_BASE_PATH=/` で別の `dist-cloudflare/` へビルドする。
- `cloudflare-site` artifactを公開ジョブへ引き継ぎ、Wranglerで本番ブランチ `main` にアップロードする。
- 公開直後はCloudflareの `episodes.json` と検証済みJSONを比較する。復旧用 `restore_commit` も利用できる。
- `Watch published site` はCloudflare Cronから2時間ごとに起動し、公開JSONを確認する。異常は既存の運用アラートIssueへまとめる。
- `web/public/_headers` でCloudflareの `episodes.json` のキャッシュを無効にし、HTMLも再検証する。

自動更新を一時停止する場合は `Update and deploy site` をDisableする。公開用変数・Secretの削除では既存サイトは非公開にならない。

GitHub Pagesの旧URLとCloudflareのURLは別オリジンなので、移行前のlocalStorageに保存していたお気に入りは自動移行されない。

公式手順: [Direct UploadとCIの連携](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)。

## セキュリティの維持

### 依存関係

- 未使用のPuppeteer・フォント・日付処理・旧公開用ツールは削除済み。Webは静的ファイルだけを配信し、PHPやPages Functionsは使用しない。
- npmはlockfileで固定し、`npm ci --ignore-scripts` で依存パッケージのインストール時スクリプトを実行しない。Pythonは `requirements-web.txt` に直接・間接依存のバージョンとSHA-256を固定し、`pip install --require-hashes` で検証する。
- `Security checks` が全npm依存 (開発用を含む) とWeb運用用Python依存を毎週・依存変更時に検査する。監査ツールは `requirements-security.txt` で管理し、公開用Secretを渡さない。ローカル専用の `requirements.txt` はこのWeb監査の対象外。
- 失敗時は `運用アラート: セキュリティ確認` を1件作り、検査が回復したら閉じる。既存Issueがある間は増やさない。通信失敗も検査失敗として扱う。新しい脆弱性が判明しても、定期監査だけを理由に放送更新を自動停止する設定にはしていない。
- Dependabotがnpm・Web運用用Python・GitHub Actionsの更新PRを毎週提案する。ローカル音声ツール用の `requirements.txt` は除外する。自動マージは行わず、変更内容とテスト結果を確認する。Pythonの更新では対応するハッシュも更新する。PRでは脆弱性検査に加えてテスト・lint・ビルドを実行する。

```bash
python -m pip install --require-hashes -r requirements-web.txt
python -m pip install -r requirements-security.txt
python -m pip_audit --require-hashes --disable-pip -r requirements-web.txt
cd web
npm run audit:security
```

### 自動公開と管理アカウント

- GitHub Actionsは公式リポジトリの検証済みコミットSHAに固定する。Wranglerもバージョンを固定する。更新はDependabotの提案や公式リリースを確認して行う。
- ビルド・監査・公開確認はGitHubの読み取り権限で実行する。Gitへの書き込みはJSONを保存する専用ジョブに分離し、Issue作成権限も報告ジョブだけに与える。Cloudflare Secretを使うのは公開ジョブだけ。
- Cloudflare APIトークンは対象アカウントのCloudflare Pages編集権限に限定する。この権限はアカウント内のPagesプロジェクトに及ぶため、プロジェクト1件だけに限定された権限とは異なる。
- 2026-10-25に既存トークンの有効期限を90日に変更。Cloudflare画面で確認した失効日は **2027-01-23**。値や権限の拡張は行っていない。
- 期限の30日前から週次検査が失敗してIssueで通知する。期限切れでは自動更新の公開が失敗するが、公開済みの静的サイトは残る。期限の記録だけではトークン自体の有効性を証明できないため、通常の公開ジョブでも実際の認証を確認する。
- 更新時はCloudflareで期限付きの同じ最小権限のトークンを用意し、GitHubの `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_TOKEN_EXPIRES_ON` を更新する。公開成功を確認し、不要になった旧トークンは失効する。値をログ・Issue・チャットへ貼り付けない。
- GitHubとCloudflareの二段階認証を有効にし、復旧コードを本人が安全な場所に保管する。認証アプリやセキュリティキーの登録は本人が行う。

### 定期起動用の認証情報

- 2026-10-31にGitHubのFine-grained personal access tokenを発行。対象は `koya-sato-017/kizukino-gakkou-web` だけ。Actionsの読み書きと、付随するMetadataの読み取りに限定する。ソースの書き込みや他リポジトリの管理権限は付けない。
- 失効日は **2027-01-29**。値はCloudflare WorkerのProduction Secret `GITHUB_ACTIONS_TOKEN` に保存し、コード・ログ・GitHub変数・チャットへは記載しない。
- GitHub変数 `SCHEDULER_TOKEN_EXPIRES_ON` には失効日だけを保存する。週次検査で30日前から通知する。更新時はCloudflareのSecretとGitHubの期限変数を両方更新する。
- Workerの一般公開URLとプレビューURLを無効化し、HTTP経由の任意実行も404にする。起動先のリポジトリ・ワークフロー・ブランチを固定する。

### ブラウザーの保護

- `web/public/_headers` のCSPで、スクリプト・CSS・フォント・JSON取得は同一サイト、音声は `https://cdncf.stand.fm` のみに制限する。紙の質感用画像だけ `data:` を許可する。外部へのリンクを開く操作は可能。
- インラインスクリプト・インラインスタイル属性・外部サイトのiframe埋め込み・フォーム送信を禁止する。イラストの配置は外部CSSへ移し、インラインスタイルの許可を不要にした。
- MIME形式の推測を禁止し、参照元情報の送信を抑止する。カメラ・マイク・位置情報など、サイトで不要なブラウザー権限も無効にする。
- `python -m src.check_web_security` が公開HTMLの実際のHTTPヘッダーを検査する。Viteの開発サーバーはCloudflare用ヘッダーを適用しないため、本番相当の確認ではCloudflareの公開結果を使う。
- 音声配信元や外部サービスを追加する場合は、実際に必要なホストだけCSPへ追加し、検査コードも見直す。全ホストや `unsafe-inline` を一括許可して回避しない。

## GitHub Pagesの公開停止

2026-10-25に公開先をCloudflare Pagesへ統一した。

- 自動更新ワークフローからGitHub Pages用のビルド、artifact、公開ジョブ、公開確認を削除。
- 独立監視もCloudflareのURLだけを確認する。
- GitHubの Settings → Pages で公開を停止する。Sourceは「Deploy from a branch」、Branchは「None」とし、GitHub Pagesの自動公開元を設定しない。
- GitHub Pagesを再開する操作や旧 `deploy.sh` / `npm run deploy` は通常運用では使用しない。
