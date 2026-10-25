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

// [PCのx, y, 幅, 角度, 小さい画面のx, y, 幅]。中央は文字のために空ける。
const positions = [
  [4, 23, 132, -14, 3, 5, 68],
  [86, 21, 112, 14, 80, 5, 58],
  [-2, 52, 148, -13, -5, 80, 64],
  [94, 51, 98, 18, 93, 72, 48],
  [13, 5, 62, -9, 33, 3, 32],
  [82, 5, 76, 11, 55, 6, 38],
  [7, 78, 105, 9, 6, 87, 66],
  [85, 77, 112, -12, 80, 82, 64],
  [24, 85, 64, -13, 32, 87, 33],
  [0, 36, 58, 12, -2, 15, 28],
  [94, 34, 78, -12, 94, 15, 34],
  [74, 88, 60, 17, 60, 86, 31],
  [-2, -5, 80, 12, -4, -4, 34],
  [40, -3, 72, -10, 46, 13, 32],
  [2, 67, 56, 15, 47, 1, 26],
  [96, -4, 86, -12, 94, -3, 42],
  [43, 93, 72, -9, 45, 94, 37],
  [59, 91, 66, 9, 73, 93, 32],
];

export default function BrandScene() {
  return (
    <div className="brand-scene" aria-hidden="true">
      {positions.map(
        ([x, y, size, angle, mobileX, mobileY, mobileSize], index) => (
          <span
            key={index}
            className={`motif motif-${index}`}
            style={
              {
                "--x": `${x}%`,
                "--y": `${y}%`,
                "--size": `${size}px`,
                "--angle": `${angle}deg`,
                "--mobile-x": `${mobileX}%`,
                "--mobile-y": `${mobileY}%`,
                "--mobile-size": `${mobileSize}px`,
              } as CSSProperties
            }
          >
            <Illustration index={index} />
          </span>
        ),
      )}
    </div>
  );
}
