# デザインとイラスト

- 明るいクリーム地、濃い青緑の文字、朱赤のアクセント。
- 「キズキノ學校」を二段の大きなロゴとして組み、「ノ」だけを傾けて音の線を添える。
- 音声と学びにまつわる18点を周囲に散らす。写真、人物、価格表示は使用しない。
- かすれと印刷の揺らぎはイラスト、紙の微細な粒子、注意書き枠に限定し、文字の影・縁取りは使用しない。
- 検索・シリーズ・放送カードは意味のまとまりごとに離し、スマートフォンでは一列の放送カードにする。
- 話数・日時・放送名は既存の取得データから表示する。

## 素材

保存先: `public/illustrations/learning-atlas.png`

制作: imagegenスキル、組み込みのimage_genツール。生成した透過PNGをプロジェクトへコピーし、`src/BrandScene.tsx` のSVG表示領域で各モチーフを配置する。元のPNGは再加工していない。

添付された見本は構成・印刷の質感の参考とし、見本の文字・人物・物は複製していない。

## 最終生成プロンプト

```text
Use case: illustration-story. Asset type: production website decorative sprite atlas, NOT a website mockup. Create ONE clean transparent PNG atlas with EXACTLY 18 separate vintage Japanese Showa-era learning and audio objects, arranged on a strict invisible 6-column by 3-row grid (18 equal cells). Canvas aspect ratio 2:1, high resolution. Each object is completely contained within its own cell with at least 12% transparent padding, no overlaps, no grid lines, no shadows outside the object. Row 1 left to right: coral red portable transistor radio, dark ink-blue over-ear headphones, golden yellow open book with cream pages, coral red pencil angled diagonally, turquoise vintage tabletop microphone, dark ink-blue vinyl record with red center. Row 2 left to right: yellow cassette tape with coral label, mint-green small globe on a dark blue stand, coral red closed notebook, warm yellow light bulb, dark blue megaphone with coral mouth, turquoise pair of scissors. Row 3 left to right: coral red small alarm clock, blue paper airplane, yellow fountain pen, mint green pocket camera, coral envelope with cream folded letter, small green plant with a yellow pot. Style: beautiful editorial cut-paper gouache illustration inspired by mid-century Japanese educational posters and screen-printed stationery, simple robust silhouettes, handcrafted slightly irregular dark ink-blue contour lines, subtle fine stippled ink-grain INSIDE the illustrations, tiny offset of color printing inside shapes. Cheerful vivid object colors, not muted: tomato coral #ed4a31, honey yellow #f2bf39, turquoise #56b7b0, leaf green and dark blue #193b40. Viewed directly from above as graphic objects, not photorealistic. Fully transparent background, no paper background, no table, no people. Absolutely NO text, NO letters, NO numbers, NO brand names, NO sale stickers, NO badges, NO paint splashes, NO typography, NO drop shadows, NO glow. Consistent scale and illustration style across all 18 cells. These are charming detailed collectible illustrations, not generic UI outline icons.
```
