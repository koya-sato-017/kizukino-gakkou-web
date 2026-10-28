import { useEffect, useRef } from "react";
import { mountHeroSoundfield } from "./heroSoundfield";

/** 紙面の上に描く短い「音の輪」。本文やリンクは元のDOMのまま保つ。 */
export default function HeroMotion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest<HTMLElement>(".hero");
    if (!canvas || !hero) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dispose: (() => void) | undefined;
    const synchronize = () => {
      dispose?.();
      dispose = undefined;
      if (preference.matches) {
        canvas.dataset.webglState = "reduced-motion";
        return;
      }
      dispose = mountHeroSoundfield(canvas, hero);
    };
    synchronize();
    preference.addEventListener("change", synchronize);
    return () => {
      preference.removeEventListener("change", synchronize);
      dispose?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-webgl" aria-hidden="true" />;
}
