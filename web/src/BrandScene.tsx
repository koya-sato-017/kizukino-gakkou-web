import type { CSSProperties } from "react";

const ATLAS = `${import.meta.env.BASE_URL}illustrations/learning-atlas.png`;
const crops = [
  [20, 22, 304, 303],
  [343, 24, 279, 286],
  [625, 70, 346, 231],
  [972, 30, 229, 281],
  [1244, 24, 181, 298],
  [1470, 35, 290, 281],
  [21, 347, 309, 211],
  [340, 311, 247, 294],
  [641, 327, 261, 261],
  [962, 316, 199, 275],
  [1190, 333, 291, 249],
  [1480, 319, 280, 276],
  [42, 565, 239, 305],
  [303, 597, 313, 250],
  [603, 570, 281, 280],
  [888, 620, 300, 230],
  [1202, 583, 286, 270],
  [1491, 574, 256, 292],
];
// 近接するモチーフが表示領域に入り込まないよう、輪郭の外側を隠す。
const masks: Record<number, string> = {
  7: "340,350 407,311 500,311 587,369 587,520 539,547 564,605 376,605 387,545 340,499",
  8: "641,327 849,327 902,547 894,566 806,590 672,587",
  11: "1480,319 1612,319 1667,357 1762,561 1762,596 1697,596 1569,476 1480,464",
  13: "303,699 617,589 537,851 427,814 345,746",
  14: "603,849 624,778 837,579 879,577 892,609 685,824",
  17: "1491,638 1525,574 1675,574 1747,631 1747,866 1491,866",
};

/** 1枚のイラストシートを表示領域で切り分ける。画像自体の再加工は行わない。 */
export function Illustration({
  index,
  className = "",
}: {
  index: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`illustration ${className}`}
      viewBox={crops[index].join(" ")}
      focusable="false"
    >
      {masks[index] && (
        <defs>
          <clipPath id={`motif-clip-${index}`}>
            <polygon points={masks[index]} />
          </clipPath>
        </defs>
      )}
      <image
        href={ATLAS}
        width="1774"
        height="887"
        clipPath={masks[index] ? `url(#motif-clip-${index})` : undefined}
      />
    </svg>
  );
}

// 学びと音声の道具を、文字を避けて周囲に散らす。
const positions = [
  [5, 13, 154, -14],
  [84, 12, 135, 14],
  [0, 48, 174, -13],
  [91, 45, 124, 18],
  [23, 2, 87, -9],
  [73, 2, 95, 11],
  [8, 79, 130, 9],
  [84, 77, 144, -12],
  [24, 84, 94, -13],
  [0, 30, 78, 12],
  [91, 26, 96, -12],
  [73, 85, 86, 17],
  [-3, -5, 103, 12],
  [35, -5, 95, -10],
  [2, 68, 72, 15],
  [94, -6, 109, -12],
  [40, 91, 99, -9],
  [57, 89, 93, 9],
];

export default function BrandScene() {
  return (
    <div className="brand-scene" aria-hidden="true">
      {positions.map(([x, y, size, angle], index) => (
        <span
          key={index}
          className={`motif motif-${index}`}
          style={
            {
              "--x": `${x}%`,
              "--y": `${y}%`,
              "--size": `${size}px`,
              "--angle": `${angle}deg`,
            } as CSSProperties
          }
        >
          <Illustration index={index} />
        </span>
      ))}
    </div>
  );
}
