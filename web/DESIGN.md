# デザインとイラスト

- 明るいクリーム地、濃い青緑の文字、朱赤のアクセント。
- ロゴはユーザー提供の公式画像を使用する。ヘッダー・ファーストビュー・フッターに扉のシンボル付きロゴを置く。赤い背景を透過させ、文字と扉マークを濃いグレーにした画像を使用する。表示領域と色は `BrandLogo.tsx` とCSSで統一する。
- 画像以外の文字(セクション見出し・シリーズ名・放送タイトル・本文・操作ボタン・日時)はすべて「Zen Kaku Gothic New」に統一する。
- フォントはFontsourceのnpmパッケージから同梱する。出典: [Zen Kaku Gothic New](https://fontsource.org/fonts/zen-kaku-gothic-new)。ライセンスは `public/fonts/` に同梱する。
- 音声と学びにまつわる18点を周囲に散らす。写真、人物、価格表示は使用しない。
- ファーストビュー中央はロゴ・メッセージ・ボタンのために空ける。PCではイラストを外周へ配置し、1000px以下では主に上下へ集め、文字の左右に重ねない。ロゴの大きさと余白は画面幅に合わせて変える。
- かすれと印刷の揺らぎはイラスト、紙の微細な粒子に限定し、文字の影・縁取りは使用しない。
- 検索・シリーズ・放送カードは意味のまとまりごとに離し、スマートフォンでは一列の放送カードにする。
- 話数・日時・放送名は既存の取得データから表示する。

- 「放送を聴いてみる」と「さらに放送を読み込む」は矢印だけを周期的に小さく動かす。ホバー・キーボードフォーカスで少し浮き、押下時に沈む。OSの「動きを減らす」設定では動かさない。

## 公式ロゴ

ユーザー提供画像を加工せずコピー。元画像は変更しない。

- `public/brand/logo-orange.jpg`: ユーザー提供の `logo__kizukinogakkou_orange.jpg` (元画像を保存)
- `public/brand/logo-charcoal.png`: 上記画像を組み込みimage_genで背景透過・濃いグレーに編集。生成PNGは再加工せず、SVGのviewBoxで上下の余白を調整して表示する。

編集方法: imagegenスキルの組み込み `image_gen` (背景透過を指定)。最終プロンプト:

```text
Use case: background-extraction. Asset type: official website logo, precise recoloring of an existing logo. Edit target: provided orange rectangular official logo with open-door symbol followed by Japanese wordmark. Remove ALL orange/red background and make it genuinely transparent (alpha), including the holes and cutouts inside the door handles and glyphs. Change ALL formerly white strokes of both the symbol and the wordmark to solid near-black charcoal gray #303030. Text verbatim: キズキノ學校. CRITICAL invariants: trace/preserve the exact original glyph shapes, strokes, spacing, positioning and open-door symbol; do not typeset new lettering, do not substitute a font, do not redesign or redraw with different proportions. Keep the same horizontal composition and approximately same 1210:216 canvas aspect ratio with the original small margins, no extra blank space. No orange/red pixels, no colored rectangle, no white rectangle, no shadows, no outline, no texture, no checkerboard painted into the image. Only the original precise logo silhouette in #303030 on real transparency.
```

## 素材

保存先: `public/illustrations/learning-atlas.png`

制作: imagegenスキル、組み込みのimage_genツール。生成した透過PNGをプロジェクトへコピーし、`src/BrandScene.tsx` のSVG表示領域で各モチーフを配置する。元のPNGは再加工していない。

添付された見本は構成・印刷の質感の参考とし、見本の文字・人物・物は複製していない。

## 最終生成プロンプト

```text
Use case: illustration-story. Asset type: production website decorative sprite atlas, NOT a website mockup. Create ONE clean transparent PNG atlas with EXACTLY 18 separate vintage Japanese Showa-era learning and audio objects, arranged on a strict invisible 6-column by 3-row grid (18 equal cells). Canvas aspect ratio 2:1, high resolution. Each object is completely contained within its own cell with at least 12% transparent padding, no overlaps, no grid lines, no shadows outside the object. Row 1 left to right: coral red portable transistor radio, dark ink-blue over-ear headphones, golden yellow open book with cream pages, coral red pencil angled diagonally, turquoise vintage tabletop microphone, dark ink-blue vinyl record with red center. Row 2 left to right: yellow cassette tape with coral label, mint-green small globe on a dark blue stand, coral red closed notebook, warm yellow light bulb, dark blue megaphone with coral mouth, turquoise pair of scissors. Row 3 left to right: coral red small alarm clock, blue paper airplane, yellow fountain pen, mint green pocket camera, coral envelope with cream folded letter, small green plant with a yellow pot. Style: beautiful editorial cut-paper gouache illustration inspired by mid-century Japanese educational posters and screen-printed stationery, simple robust silhouettes, handcrafted slightly irregular dark ink-blue contour lines, subtle fine stippled ink-grain INSIDE the illustrations, tiny offset of color printing inside shapes. Cheerful vivid object colors, not muted: tomato coral #ed4a31, honey yellow #f2bf39, turquoise #56b7b0, leaf green and dark blue #193b40. Viewed directly from above as graphic objects, not photorealistic. Fully transparent background, no paper background, no table, no people. Absolutely NO text, NO letters, NO numbers, NO brand names, NO sale stickers, NO badges, NO paint splashes, NO typography, NO drop shadows, NO glow. Consistent scale and illustration style across all 18 cells. These are charming detailed collectible illustrations, not generic UI outline icons.
```
