# Webサイトの運用

## 更新の流れ

GitHub Actionsの `Update and deploy site` が毎時17分に実行される。配信時刻から反映までは通常1時間程度とビルド時間が必要。GitHub側の混雑による遅延はあり得る。

1. stand.fmの全ページを取得する。
2. 放送ID、公開状態、配信日時、ページ送り、既存データとの件数差を検証する。
3. 新着や未取得の詳細を優先し、1回最大40件・同時4接続で概要と音声URLを確認する。
4. 検証済みデータを一時ファイルに書き、正常終了後だけJSONを置き換える。
5. Pythonの回帰テスト、フロントエンドのlintとビルドに成功したらGitにデータを記録し、GitHub Pagesへ公開する。
6. 公開URLのJSONと今回のデータを比較する。

一覧取得の途中失敗、0件、ID重複、公開状態の欠損、大幅な既存回の消失、最新配信日の後退は失敗として終了し、既存JSONを維持する。削除は全件一覧の取得が完了した場合だけ反映する。限定化された回の音声URLと概要は公開JSONから除く。

詳細取得の一部失敗では前の概要・音声URLを維持し、6時間後以降に再試行する。新着の音声URLが取れない場合もstand.fmへのリンクは表示できる。詳細取得が全件失敗なら公開を止める。一部失敗は公開後の確認で異常として通知する。既存回の詳細は7日以上経過したものを件数制限内で再確認するため、全放送の再確認が7日以内に完了する保証はない。

## 初期設定

- GitHubの Settings → Pages → Source を **GitHub Actions** にする。
- ワークフローのコードをデフォルトブランチ `main` に置く。
- Actions → Update and deploy site → Run workflow から初回を実行する。
- チャンネルIDは公開情報なので追加の認証情報は不要。Google用の `credentials.json` やローカルの `config.json` は使用しない。
- 自動更新は保存と公開を同じワークフローで行う。`GITHUB_TOKEN` によるpushは別のpushワークフローを起動しないため、push後の別ワークフロー任せにしない。

## 監視と通知

| 確認 | 異常とする条件 |
|---|---|
| 公開直後 | 公開JSONが今回のデータと一致しない、読み込みに失敗、詳細取得の失敗がある |
| 2時間ごとの独立した確認 | 最終取得から3時間超、最新の公開放送から72時間超、JSONが不正 |

失敗時は `運用アラート: サイトの自動更新` または `運用アラート: 公開サイトの更新停止` というGitHub Issueを1件だけ作る。回復後に閉じる。失敗が継続しても同じIssueを増やさない。新しい障害は別Issueになる。

Issueの通知を受け取るには、GitHubリポジトリのWatchでIssuesを受信する設定と、個人アカウントの通知設定を確認する。メールやSlackの送信先は未設定。

放送休止も72時間の確認に該当するため、配信元を見て原因を切り分ける。休止中は監視の `--max-episode-age-hours` を伸ばすか、0で配信間隔だけの検知を無効化する。

両ワークフローはGitHub上で動くため、GitHub Actions全体の停止は自分では検知できない。公開リポジトリでは60日間活動がないと定期実行が無効になる条件もある。正常時は取得日時を含むコミットが残るが、失敗が長期化する場合は手動確認が必要。厳密な監視が必要になったら外部サービスから `episodes.json` の `updated_at` を確認する。

## 手動更新と検証

```bash
python3 -m venv .venv-web
source .venv-web/bin/activate
python -m pip install -r requirements-web.txt
python -m unittest discover -s tests -v
python -m src.export_web_data
cd web
npm ci
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

## Cloudflare Pagesへの移行

同じReact + ViteのソースとJSONを使用できる。

| 項目 | Cloudflare Pagesの設定 |
|---|---|
| Root directory | `web` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js | 24 |
| 環境変数 | `VITE_BASE_PATH=/` |

移行時はActionsの取得・検証・データ保存を残し、公開ジョブをCloudflare用に変更する。取得後のコミットをCloudflareのGit連携でビルドさせる方式、または検証済みの `web/dist` を明示的にアップロードする方式を選ぶ。公開後の確認先URLも変更する。Cloudflareに置くだけではstand.fmからの取得は自動化されない。

GitHub PagesのURLとCloudflareのURLは別オリジンなので、現在のlocalStorageに保存しているお気に入りは自動移行されない。切り替え前にエクスポート・インポート機能を追加するか、利用者に案内する。独自ドメインを継続利用できる構成にしておくと、将来のホスティング変更の影響を減らせる。
