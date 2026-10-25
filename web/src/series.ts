/** 表記揺れの正規化マップ */
const NORMALIZE_MAP: [RegExp, string][] = [
  [/事は/g, "ことは"],
  [/の事/g, "のこと"],
  [/コンビニに学べ！/g, "コンビニから学べ"],
  [/コンビニから学ぼう/g, "コンビニから学べ"],
  [/もう一度みたい/g, "もう一度観たい"],
  [/パラレルワーク（複業）革命/g, "パラレルワーク革命"],
  [/パラレルワーク革命#/g, "パラレルワーク革命"],
  [/もっとやさしいWEB\s*3/g, "もっとやさしいWEB3"],
  [/もっとやさしいWEB\s*３/g, "もっとやさしいWEB3"],
  [/2026年の必須教養/g, "2026年の「必須教養」"],
  [/SCOP文化を語る$/g, "SCOP文化を語ろう"],
  [/一緒にしてはならない$/g, "一緒にしてはならない話"],
  [/パラレルワーク（複業）への筋道/g, "パラレルワークへの筋道"],
  [/複業（パラレルワーク）/g, "複業2024"],
  [/時間泥棒に気をつけろ！/g, "時間泥棒に気をつけろ"],
];

/** シリーズ名を正規化 */
function normalizeSeriesName(name: string): string {
  let normalized = name.trim();
  for (const [pattern, replacement] of NORMALIZE_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

/** タイトルからシリーズ名を抽出 */
export function extractSeriesName(title: string): string | null {
  // 【XXX】の後のテキストを取得
  const bracketMatch = title.match(/[【〖]([^】〗]+)[】〗](.+)/);
  if (!bracketMatch) return null;

  // この企画は連番が本文ではなく括弧内にある。告知など本文だけの言及は含めない。
  const bracketName = bracketMatch[1].normalize("NFKC").replace(/\s+/g, "");
  if (/^あんな時代もあったね[、,]?と\d*$/.test(bracketName)) {
    return "あんな時代もあったね、と";
  }

  const content = bracketMatch[2];

  // パターン1: 「シリーズ名N〜」（末尾の数字+〜）
  const numTildeMatch = content.match(
    /^(.+?)(\d+|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])[〜～]/,
  );
  if (numTildeMatch && numTildeMatch[1].trim().length >= 4) {
    return normalizeSeriesName(numTildeMatch[1]);
  }

  // パターン2: 「シリーズ名 最終回」「シリーズ名 完結」
  const finalMatch = content.match(/^(.+?)[\s\u3000]*(最終回|完結)/);
  if (finalMatch && finalMatch[1].trim().length >= 4) {
    return normalizeSeriesName(finalMatch[1]);
  }

  return null;
}
