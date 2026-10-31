# Cloudflareから更新・監視を起動する

このWorkerは定期実行専用。取得・ビルド・公開の処理は既存のGitHub Actionsに残す。

| Cron (UTC) | 実行先 | 用途 |
|---|---|---|
| `17 * * * *` | `update-site.yml` / `main` | 毎時17分に取得・検証・公開 |
| `47 */2 * * *` | `watch-site.yml` / `main` | 2時間ごとに公開データと保護設定を確認 |

## 認証

- GitHubのFine-grained personal access tokenを使う。
- Resource ownerは `koya-sato-017`。Repository accessは `kizukino-gakkou-web` の1件だけ。
- Repository permissionsは `Actions: Read and write` と自動で付く `Metadata: Read-only`。Contentsやアカウント管理の権限は付けない。
- 期限付きで発行し、値はCloudflare WorkerのSecret `GITHUB_ACTIONS_TOKEN` にだけ保存する。コード・設定ファイル・ログ・チャットへ記載しない。
- GitHub ActionsのVariable `SCHEDULER_TOKEN_EXPIRES_ON` に実際の失効日を記録し、週次セキュリティ検査で期限の30日前から通知する。
- 既存のPages公開トークンは、GitHub ActionsからCloudflareへ公開するための別の認証情報。権限を拡張して兼用しない。

## 切り替え手順

1. `node --test automation/cloudflare-scheduler/worker.test.mjs` でテストする。
2. このコード・Cron・SecretをWorker `kizukino-gakkou-scheduler` に配置する。
3. Cloudflareから実行し、GitHub側で `workflow_dispatch` が起動し公開確認まで成功することを確かめる。
4. 更新・監視のGitHub側 `schedule` だけを削除する。手動実行とコード変更時の公開は残す。
5. 定期実行された更新と監視を双方で確認する。

Workerと設定はこのフォルダを正とする。Wranglerのバージョンは既存の公開処理と同じ `4.152.0` を使う。管理方法を切り替える際も、この設定とCloudflare上のCronが一致するようにする。

```bash
cd automation/cloudflare-scheduler
npx wrangler@4.152.0 deploy --dry-run --outdir dist
```

## 動作と障害時

- 起動できるリポジトリ、ワークフロー、ブランチはコードで固定する。
- `workers.dev` とプレビューURLは無効。HTTPハンドラーも常に404で、リクエストからの任意実行はできない。
- 20秒で通信を打ち切る。一時的な障害は最大3回まで再試行し、レート制限の待ち時間を尊重する。認証・権限エラーは繰り返さない。
- 成功時はワークフロー名、予定時刻、試行回数だけを記録する。認証情報、レスポンス本文、通信例外の原文は記録しない。
- CloudflareのCron Events / Workers LogsとGitHubのActions実行履歴を照合する。APIへの起動要求の成功だけでは、後続の公開成功を意味しない。
- 認証失敗時はトークンの有効期限・対象リポジトリ・Actions権限を確認する。再発行時はSecretと期限変数を更新して、実際の起動成功を確認する。
- 障害復旧のため自動更新を止める場合は、GitHub Actionsの `Update and deploy site` をDisableする。再開時はEnableしてから手動実行する。
- CloudflareやGitHub全体の障害を、この構成だけで完全に検知・解消する保証はない。

公式資料: [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[GitHub workflow_dispatchと必要権限](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)。
