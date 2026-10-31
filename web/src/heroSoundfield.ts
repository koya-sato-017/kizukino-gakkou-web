// WebGL 1の三角形だけで薄い波紋を描く。画像・外部ライブラリーは使用しない。
const SEGMENTS = 80;
const MAX_WAVES = 6;
const RINGS = 3;
const LIFE = 2.25;
const STRIDE = 4;
const MASKS = 6;
const VERTEX_SHADER = `
attribute vec2 a_position;
attribute float a_alpha;
attribute float a_edge;
uniform vec2 u_size;
varying vec2 v_position;
varying float v_alpha;
varying float v_edge;
void main() {
  vec2 clip = a_position / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_position = a_position;
  v_alpha = a_alpha;
  v_edge = a_edge;
}`;
const FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_masks[6];
varying vec2 v_position;
varying float v_alpha;
varying float v_edge;
void main() {
  float mask = 1.0;
  for (int i = 0; i < 6; i++) {
    vec4 r = u_masks[i];
    float outside = max(max(r.x-v_position.x, v_position.x-r.z),
                        max(r.y-v_position.y, v_position.y-r.w));
    mask *= smoothstep(0.0, 12.0, outside);
  }
  float edge = smoothstep(0.0, 0.28, v_edge) * (1.0-smoothstep(0.72, 1.0, v_edge));
  float alpha = v_alpha * edge * mask;
  // 朱色は既存の差し色 #c63b26。premultiplied alphaで紙の地色を保つ。
  gl_FragColor = vec4(vec3(0.7765, 0.2314, 0.1490) * alpha, alpha);
}`;

interface Wave {
  x: number;
  y: number;
  born: number;
  strength: number;
}

export function rasterScale(
  width: number,
  height: number,
  deviceScale: number,
) {
  return Math.min(
    Math.max(deviceScale, 1),
    1.5,
    Math.sqrt(1_200_000 / Math.max(1, width * height)),
  );
}

export function mountHeroSoundfield(
  canvas: HTMLCanvasElement,
  hero: HTMLElement,
): () => void {
  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      premultipliedAlpha: true,
    });
  } catch {
    gl = null;
  }
  if (!gl) {
    canvas.dataset.webglState = "unavailable";
    return () => {};
  }
  const context = gl;
  const vertices = new Float32Array(MAX_WAVES * RINGS * SEGMENTS * 6 * STRIDE);
  const circle = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const masks = new Float32Array(MASKS * 4);
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let sizeLocation: WebGLUniformLocation | null = null;
  let masksLocation: WebGLUniformLocation | null = null;
  let width = 1;
  let height = 1;
  let waves: Wave[] = [];
  let frame = 0;
  let lastFrame = -Infinity;
  let lastPointer = { x: -Infinity, y: -Infinity, time: -Infinity };
  let disposed = false;
  let lost = false;
  let initialized = false;
  const initialRect = hero.getBoundingClientRect();
  let visible = initialRect.bottom > 0 && initialRect.top < window.innerHeight;
  const state = (value: string) => {
    if (canvas.dataset.webglState !== value) canvas.dataset.webglState = value;
  };

  const shader = (kind: number, source: string) => {
    const result = context.createShader(kind);
    if (!result) return null;
    context.shaderSource(result, source);
    context.compileShader(result);
    if (!context.getShaderParameter(result, context.COMPILE_STATUS)) {
      context.deleteShader(result);
      return null;
    }
    return result;
  };
  const initialize = () => {
    const vertex = shader(context.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = shader(context.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) {
      if (vertex) context.deleteShader(vertex);
      if (fragment) context.deleteShader(fragment);
      return false;
    }
    program = context.createProgram();
    if (!program) {
      context.deleteShader(vertex);
      context.deleteShader(fragment);
      return false;
    }
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      context.deleteProgram(program);
      program = null;
      return false;
    }
    buffer = context.createBuffer();
    if (!buffer) {
      context.deleteProgram(program);
      program = null;
      return false;
    }
    context.useProgram(program);
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      vertices.byteLength,
      context.DYNAMIC_DRAW,
    );
    for (const [name, count, offset] of [
      ["a_position", 2, 0],
      ["a_alpha", 1, 8],
      ["a_edge", 1, 12],
    ] as const) {
      const location = context.getAttribLocation(program, name);
      context.enableVertexAttribArray(location);
      context.vertexAttribPointer(
        location,
        count,
        context.FLOAT,
        false,
        STRIDE * 4,
        offset,
      );
    }
    sizeLocation = context.getUniformLocation(program, "u_size");
    masksLocation = context.getUniformLocation(program, "u_masks[0]");
    context.enable(context.BLEND);
    context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA);
    context.clearColor(0, 0, 0, 0);
    initialized = true;
    return true;
  };
  const stop = (next: string) => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!lost) context.clear(context.COLOR_BUFFER_BIT);
    state(next);
  };
  const measure = () => {
    if (disposed || lost || !initialized) return;
    const bounds = hero.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const scale = rasterScale(width, height, window.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(width * scale));
    const backingHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      context.viewport(0, 0, backingWidth, backingHeight);
    }
    const selectors = [
      ".hero-logo",
      ".hero-kicker",
      ".hero-description",
      ".hero-cta",
      ".hero-edition",
      ".hero-scroll-cue",
    ];
    selectors.forEach((selector, index) => {
      const rect = hero.querySelector(selector)?.getBoundingClientRect();
      const pad = index === 0 ? 22 : 10;
      masks.set(
        rect
          ? [
              rect.left - bounds.left - pad,
              rect.top - bounds.top - pad,
              rect.right - bounds.left + pad,
              rect.bottom - bounds.top + pad,
            ]
          : [-9999, -9999, -9998, -9998],
        index * 4,
      );
    });
    context.uniform2f(sizeLocation, width, height);
    context.uniform4fv(masksLocation, masks);
  };

  const schedule = () => {
    if (
      !disposed &&
      initialized &&
      !lost &&
      visible &&
      !document.hidden &&
      !frame &&
      waves.length
    )
      frame = requestAnimationFrame(draw);
  };
  const draw = (now: number) => {
    frame = 0;
    if (disposed || lost || !visible || document.hidden) return;
    if (now - lastFrame < 1000 / 30) {
      schedule();
      return;
    }
    lastFrame = now;
    waves = waves.filter((wave) => (now - wave.born) / 1000 < LIFE + 0.28);
    context.clear(context.COLOR_BUFFER_BIT);
    let cursor = 0;
    const put = (x: number, y: number, alpha: number, edge: number) => {
      vertices[cursor++] = x;
      vertices[cursor++] = y;
      vertices[cursor++] = alpha;
      vertices[cursor++] = edge;
    };
    for (const wave of waves) {
      for (let ring = 0; ring < RINGS; ring++) {
        const age = (now - wave.born) / 1000 - ring * 0.14;
        if (age < 0 || age > LIFE) continue;
        const progress = age / LIFE;
        const radius = 8 + progress * Math.min(240, width * 0.4, height * 0.44);
        const halfWidth = 1.25;
        const alpha =
          Math.sin(progress * Math.PI) *
          (0.16 + wave.strength * 0.3) *
          (1 - ring * 0.14);
        for (let i = 0; i < SEGMENTS; i++) {
          const [x1, y1] = circle[i];
          const [x2, y2] = circle[i + 1];
          const inner = radius - halfWidth;
          const outer = radius + halfWidth;
          put(wave.x + x1 * inner, wave.y + y1 * inner, alpha, 0);
          put(wave.x + x1 * outer, wave.y + y1 * outer, alpha, 1);
          put(wave.x + x2 * outer, wave.y + y2 * outer, alpha, 1);
          put(wave.x + x1 * inner, wave.y + y1 * inner, alpha, 0);
          put(wave.x + x2 * outer, wave.y + y2 * outer, alpha, 1);
          put(wave.x + x2 * inner, wave.y + y2 * inner, alpha, 0);
        }
      }
    }
    if (cursor) {
      context.bufferSubData(
        context.ARRAY_BUFFER,
        0,
        vertices.subarray(0, cursor),
      );
      context.drawArrays(context.TRIANGLES, 0, cursor / STRIDE);
      canvas.dataset.webglRenderer = "webgl";
    }
    if (waves.length) {
      state("running");
      schedule();
    } else state("idle");
  };
  const emit = (x: number, y: number, strength: number, delay = 0) => {
    if (disposed || !initialized || lost || !visible || document.hidden) return;
    waves.push({ x, y, strength, born: performance.now() + delay });
    if (waves.length > MAX_WAVES) waves.shift();
    schedule();
  };
  const pointer = (event: PointerEvent) => {
    if (
      !event.isPrimary ||
      (event.target instanceof Element &&
        event.target.closest("a,button,input,select,textarea"))
    )
      return;
    const now = performance.now();
    if (
      event.type === "pointermove" &&
      (event.pointerType !== "mouse" ||
        now - lastPointer.time < 180 ||
        Math.hypot(
          event.clientX - lastPointer.x,
          event.clientY - lastPointer.y,
        ) < 32)
    )
      return;
    const rect = hero.getBoundingClientRect();
    emit(
      event.clientX - rect.left,
      event.clientY - rect.top,
      event.type === "pointerdown" ? 1 : 0.38,
    );
    lastPointer = { x: event.clientX, y: event.clientY, time: now };
  };
  const visibility = () => {
    if (lost || disposed) return;
    if (!initialized) {
      state("unavailable");
      return;
    }
    if (document.hidden || !visible) {
      waves = [];
      stop("paused");
    } else {
      state("idle");
      schedule();
    }
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    initialized = false;
    waves = [];
    stop("lost");
  };
  const contextRestored = () => {
    if (disposed) return;
    lost = false;
    if (!initialize()) {
      state("unavailable");
      return;
    }
    measure();
    state("idle");
  };
  if (!initialize()) {
    state("unavailable");
    return () => {};
  }
  measure();
  state("idle");
  const observer = new IntersectionObserver(
    (entries) => {
      visible =
        entries[0].isIntersecting && entries[0].intersectionRatio > 0.05;
      visibility();
    },
    { threshold: [0, 0.05] },
  );
  observer.observe(hero);
  const resize = new ResizeObserver(measure);
  resize.observe(hero);
  const inner = hero.querySelector(".hero-inner");
  if (inner) resize.observe(inner);
  hero.addEventListener("pointerdown", pointer, { passive: true });
  hero.addEventListener("pointermove", pointer, { passive: true });
  hero.addEventListener("animationend", measure);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  void document.fonts.ready.then(() => {
    if (!disposed) measure();
  });
  // 最初の挨拶は3秒程度で終える。その後は触れた時だけ描画する。
  for (const [selector, delay] of [
    [".motif-0", 0],
    [".motif-1", 420],
  ] as const) {
    const rect = hero.querySelector(selector)?.getBoundingClientRect();
    if (rect)
      emit(
        rect.left - initialRect.left + rect.width / 2,
        rect.top - initialRect.top + rect.height / 2,
        0.34,
        delay,
      );
  }
  return () => {
    if (disposed) return;
    disposed = true;
    stop("idle");
    observer.disconnect();
    resize.disconnect();
    hero.removeEventListener("pointerdown", pointer);
    hero.removeEventListener("pointermove", pointer);
    hero.removeEventListener("animationend", measure);
    document.removeEventListener("visibilitychange", visibility);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    if (!lost) {
      context.deleteBuffer(buffer);
      context.deleteProgram(program);
    }
  };
}
