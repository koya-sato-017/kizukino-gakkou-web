// 起動先とブランチを固定し、外部からのHTTPリクエストでは実行できない。
export const SCHEDULES = Object.freeze({
  "17 * * * *": "update-site.yml",
  "47 */2 * * *": "watch-site.yml",
});
const REPOSITORY = "koya-sato-017/kizukino-gakkou-web";
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/`;
const MAX_ATTEMPTS = 3;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(response, attempt, now) {
  const header = response?.headers.get("retry-after");
  if (!header) return attempt * 2_000;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(header) - now();
  // 長時間のレート制限を無視した再試行は行わない。
  return Number.isFinite(delay) && delay <= 60_000
    ? Math.max(0, delay)
    : null;
}

export async function dispatchScheduled(controller, env, dependencies = {}) {
  const workflow = Object.hasOwn(SCHEDULES, controller.cron)
    ? SCHEDULES[controller.cron]
    : undefined;
  if (!workflow) throw new Error("未登録の定期実行です");
  const token = env.GITHUB_ACTIONS_TOKEN;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("GITHUB_ACTIONS_TOKENが未設定です");
  }
  const {
    fetchImpl = fetch,
    sleep = defaultSleep,
    now = Date.now,
    log = console.log,
  } = dependencies;
  let status = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetchImpl(`${API_ROOT}${workflow}/dispatches`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "kizukino-gakkou-scheduler",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
      });
    } catch {
      // 例外やレスポンス本文はログへ出さず、認証情報の混入を防ぐ。
    }
    status = response?.status ?? 0;
    await response?.body?.cancel().catch(() => {});
    if (status === 204) {
      const result = {
        event: "github-workflow-dispatched",
        workflow,
        cron: controller.cron,
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        attempt,
        status,
      };
      log(JSON.stringify(result));
      return result;
    }
    const transient = !response || status === 429 || status >= 500;
    if (!transient || attempt === MAX_ATTEMPTS) break;
    const delay = retryDelay(response, attempt, now);
    if (delay === null) break;
    await sleep(delay);
  }
  throw new Error(`GitHub定期起動に失敗しました: ${workflow} / ${status || "network-error"}`);
}

export default {
  async scheduled(controller, env) {
    await dispatchScheduled(controller, env);
  },
  fetch() {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  },
};
