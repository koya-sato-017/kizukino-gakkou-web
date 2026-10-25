/** 透過ロゴの余白をSVGの表示領域で調整し、元のPNGは再加工しない。 */
export default function BrandLogo() {
  return (
    <svg
      className="brand-logo"
      viewBox="0 160 2170 390"
      role="img"
      aria-label="キズキノ學校"
    >
      <image
        href={`${import.meta.env.BASE_URL}brand/logo-charcoal.png`}
        width="2170"
        height="725"
      />
    </svg>
  );
}
