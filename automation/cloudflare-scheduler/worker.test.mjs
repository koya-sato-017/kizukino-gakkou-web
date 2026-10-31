import assert from "node:assert/strict";
import test from "node:test";
import worker, { dispatchScheduled, SCHEDULES } from "./worker.mjs";

const TOKEN = "local-test-value-do-not-use";
const event = (cron = "17 * * * *") => ({
  cron,
  scheduledTime: Date.parse("2026-10-31T03:17:00Z"),
});
function harness(responses = [204]) {
  const requests = [];
  const delays = [];
  const logs = [];
  return {
    requests, delays, logs,
    dependencies: {
      async fetchImpl(url, options) {
        requests.push({ url, options });
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next instanceof Response ? next : new Response(null, { status: next });
      },
      async sleep(ms) { delays.push(ms); },
      log(message) { logs.push(message); },
      now: () => Date.parse("2026-10-31T03:17:00Z"),
    },
  };
}

test("登録した2種類のCronから対象ワークフローのmainだけを起動する", async () => {
  for (const [cron, workflow] of Object.entries(SCHEDULES)) {
    const h = harness();
    await dispatchScheduled(event(cron), { GITHUB_ACTIONS_TOKEN: TOKEN }, h.dependencies);
    assert.equal(h.requests.length, 1);
    const { url, options } = h.requests[0];
    assert.equal(url, `https://api.github.com/repos/koya-sato-017/kizukino-gakkou-web/actions/workflows/${workflow}/dispatches`);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(JSON.parse(options.body), { ref: "main" });
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(!h.logs.join().includes(TOKEN));
  }
});

test("未登録Cronや秘密値の未設定では通信しない", async () => {
  const h = harness();
  for (const cron of ["* * * * *", "__proto__", "constructor"]) {
    await assert.rejects(dispatchScheduled(event(cron), { GITHUB_ACTIONS_TOKEN: TOKEN }, h.dependencies), /未登録/);
  }
  for (const value of [undefined, "", "  "]) {
    await assert.rejects(dispatchScheduled(event(), { GITHUB_ACTIONS_TOKEN: value }, h.dependencies), /未設定/);
  }
  assert.equal(h.requests.length, 0);
});

test("一時的なサーバー障害では回数を制限して再試行する", async () => {
  const h = harness([503, 502, 204]);
  const result = await dispatchScheduled(event(), { GITHUB_ACTIONS_TOKEN: TOKEN }, h.dependencies);
  assert.equal(result.attempt, 3);
  assert.deepEqual(h.delays, [2000, 4000]);
});

test("通信失敗を再試行し、元の例外や秘密値は露出しない", async () => {
  const h = harness([new Error(TOKEN), new Error(TOKEN), new Error(TOKEN)]);
  await assert.rejects(dispatchScheduled(event(), { GITHUB_ACTIONS_TOKEN: TOKEN }, h.dependencies), (error) => {
    assert.match(error.message, /network-error/);
    assert.ok(!error.message.includes(TOKEN));
    return true;
  });
  assert.equal(h.requests.length, 3);
  assert.ok(!h.logs.join().includes(TOKEN));
});

test("認証・権限・ワークフロー設定エラーを繰り返さない", async () => {
  for (const status of [401, 403, 404, 422]) {
    const h = harness([status]);
    await assert.rejects(dispatchScheduled(event(), { GITHUB_ACTIONS_TOKEN: TOKEN }, h.dependencies), new RegExp(String(status)));
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.delays, []);
  }
});

test("レート制限のRetry-Afterを秒数・日時とも尊重する", async () => {
  for (const retryAfter of ["12", "Sat, 31 Oct 2026 03:17:12 GMT"]) {
    const h = harness([new Response(null, { status: 429, headers: { "Retry-After": retryAfter } }), 204]);
    await dispatchScheduled(event(), { GITHUB_ACTIONS_TOKEN: TOKEN }, h.dependencies);
    assert.deepEqual(h.delays, [12000]);
  }
});

test("長時間または不正なRetry-Afterでは追加のリクエストを送らない", async () => {
  for (const retryAfter of ["600", "invalid-date"]) {
    const h = harness([new Response(null, { status: 429, headers: { "Retry-After": retryAfter } })]);
    await assert.rejects(dispatchScheduled(event(), { GITHUB_ACTIONS_TOKEN: TOKEN }, h.dependencies), /429/);
    assert.equal(h.requests.length, 1);
  }
});

test("HTTPリクエストでは更新を実行できない", async () => {
  const response = await worker.fetch(new Request("https://example.com/?cron=17"));
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not Found");
});
