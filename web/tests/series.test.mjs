import assert from "node:assert/strict";
import test from "node:test";
import { extractSeriesName } from "../src/series.ts";

test("歴史の主役の助詞・副題・回数表記の違いを一つのシリーズにまとめる", () => {
  for (const title of [
    "【講義1072】歴史の主役から学ぶ！仕事と人生の突破術①〜田中角栄",
    "【講義1087】歴史の主役に学ぶ　第二回〜渋沢栄一「論語と算盤」",
    "【講義1106】歴史の主役から学ぶ　第3回〜松下幸之助",
    "【講義】歴史の主役から学ぶ　第４回～続編",
    "【講義】歴史の主役に学ぶ⑤〜続編",
  ]) {
    assert.equal(extractSeriesName(title), "歴史の主役から学ぶ");
  }
});

test("歴史の主役の告知や単なる言及を本編に混ぜない", () => {
  for (const title of [
    "【限定講義214】新シリーズ始動！歴史の主役に学ぶ！仕事と人生の突破術",
    "【ホームルーム】歴史の主役から学ぶ　第4回の予告",
    "【課外授業】「歴史の主役から学ぶ」の舞台裏",
  ]) {
    assert.equal(extractSeriesName(title), null);
  }
});

test("あんな時代の読点と回数表記を一つのシリーズにまとめる", () => {
  for (const label of [
    "あんな時代もあったね、と",
    "あんな時代もあったねと",
    "あんな時代もあったねと15",
    "あんな時代もあったね、と③",
    "あんな時代もあったねと⑨",
    "あんな時代もあったねと１６",
  ]) {
    assert.equal(
      extractSeriesName(`【${label}】1985年に流行ったもの。起こったこと。`),
      "あんな時代もあったね、と",
    );
  }
});

test("シリーズの告知や舞台裏を本編に混ぜない", () => {
  assert.equal(
    extractSeriesName(
      "【ホームルーム】あの人気企画「あんな時代もあったね、と」が帰ってきます",
    ),
    null,
  );
  assert.equal(
    extractSeriesName(
      "【課外授業195】質問回〜「あんな時代もあったねと」の舞台裏",
    ),
    null,
  );
});

test("既存の連番・最終回・表記揺れの検出を維持する", () => {
  assert.equal(
    extractSeriesName(
      "【講義1096】人生二周目の作り方39〜ゴールテープを切るな！",
    ),
    "人生二周目の作り方",
  );
  assert.equal(
    extractSeriesName(
      "【講義1095】脱・失われた30年　創る未来　最終回〜我々が実行すべき行動指針",
    ),
    "脱・失われた30年　創る未来",
  );
  assert.equal(
    extractSeriesName(
      "【講義1094】今の日本の事は歴史が全て教えてくれる29〜最悪の選択と致命傷",
    ),
    "今の日本のことは歴史が全て教えてくれる",
  );
  assert.equal(extractSeriesName("【講義1100】単発の放送タイトル"), null);
});
