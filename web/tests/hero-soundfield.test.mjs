import assert from "node:assert/strict";
import test from "node:test";
import { mountHeroSoundfield, rasterScale } from "../src/heroSoundfield.ts";

function environment(t, { available = true, compile = true } = {}) {
  let now = 0;
  let nextFrame = 0;
  const frames = new Map();
  const calls = { draws: 0, programs: 0, deletes: 0 };
  class Element extends EventTarget {
    interactive = false;
    closest() {
      return this.interactive ? this : null;
    }
    getBoundingClientRect() {
      return {
        left: 0,
        top: 80,
        right: 1280,
        bottom: 740,
        width: 1280,
        height: 660,
      };
    }
    querySelector() {
      return new Element();
    }
  }
  const hero = new Element();
  const document = new EventTarget();
  document.hidden = false;
  document.fonts = { ready: Promise.resolve() };
  const observers = [];
  class Observer {
    disconnected = false;
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    DYNAMIC_DRAW: 6,
    FLOAT: 7,
    BLEND: 8,
    ONE: 9,
    ONE_MINUS_SRC_ALPHA: 10,
    COLOR_BUFFER_BIT: 11,
    TRIANGLES: 12,
    createShader: () => ({}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => compile,
    deleteShader() {},
    createProgram: () => {
      calls.programs++;
      return {};
    },
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    deleteProgram() {
      calls.deletes++;
    },
    createBuffer: () => ({}),
    useProgram() {},
    bindBuffer() {},
    bufferData() {},
    getAttribLocation: () => 0,
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    getUniformLocation: () => ({}),
    enable() {},
    blendFunc() {},
    clearColor() {},
    viewport() {},
    uniform2f() {},
    uniform4fv() {},
    clear() {},
    bufferSubData() {},
    drawArrays() {
      calls.draws++;
    },
    deleteBuffer() {},
  };
  const canvas = new EventTarget();
  canvas.dataset = {};
  canvas.getContext = () => (available ? gl : null);
  const globals = {
    Element,
    document,
    window: { innerHeight: 900, devicePixelRatio: 2 },
    IntersectionObserver: Observer,
    ResizeObserver: Observer,
    requestAnimationFrame: (callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const previous = Object.fromEntries(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  t.mock.method(performance, "now", () => now);
  let dispose;
  t.after(() => {
    dispose?.();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  });
  const step = (milliseconds) => {
    const until = now + milliseconds;
    while (now < until) {
      now += 40;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    }
  };
  const pointer = (type = "pointerdown", pointerType = "mouse") => {
    const event = new Event(type);
    Object.assign(event, {
      isPrimary: true,
      pointerType,
      clientX: 180,
      clientY: 440,
    });
    hero.dispatchEvent(event);
  };
  dispose = mountHeroSoundfield(canvas, hero);
  return {
    hero,
    canvas,
    document,
    observers,
    calls,
    gl,
    frames,
    step,
    pointer,
    dispose,
  };
}

test("高DPIの大画面でも描画ピクセル数を制限する", () => {
  for (const [width, height, dpr] of [
    [390, 570, 3],
    [1280, 660, 2],
    [3840, 2160, 3],
  ]) {
    const scale = rasterScale(width, height, dpr);
    assert.ok(scale <= 1.5);
    assert.ok(width * height * scale * scale <= 1_200_001);
  }
});

test("WebGL非対応でも静的ページを保ち、描画を開始しない", (t) => {
  const env = environment(t, { available: false });
  assert.equal(env.canvas.dataset.webglState, "unavailable");
  assert.equal(env.frames.size, 0);
});

test("起動時の演出は自動で終わり、GPU描画を続けない", (t) => {
  const env = environment(t);
  env.step(4000);
  assert.ok(env.calls.draws > 0);
  assert.equal(env.canvas.dataset.webglState, "idle");
  assert.equal(env.frames.size, 0);
  const draws = env.calls.draws;
  env.step(4000);
  assert.equal(env.calls.draws, draws);
});

test("画面外と非表示タブでは停止し、戻っても勝手に再生しない", (t) => {
  const env = environment(t);
  env.step(80);
  env.observers[0].callback([{ isIntersecting: false, intersectionRatio: 0 }]);
  assert.equal(env.frames.size, 0);
  env.pointer();
  assert.equal(env.frames.size, 0);
  env.observers[0].callback([{ isIntersecting: true, intersectionRatio: 1 }]);
  assert.equal(env.frames.size, 0);
  env.pointer();
  assert.ok(env.frames.size > 0);
  env.document.hidden = true;
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(env.frames.size, 0);
  env.document.hidden = false;
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(env.frames.size, 0);
});

test("リンク上の操作やタッチスクロールは波紋を連続生成しない", (t) => {
  const env = environment(t);
  env.step(4000);
  env.hero.interactive = true;
  env.pointer();
  assert.equal(env.frames.size, 0);
  env.hero.interactive = false;
  env.pointer("pointermove", "touch");
  assert.equal(env.frames.size, 0);
  env.pointer("pointerdown", "touch");
  assert.ok(env.frames.size > 0);
});

test("GPUコンテキストの消失・復帰と後片付けに対応する", (t) => {
  const env = environment(t);
  const lost = new Event("webglcontextlost", { cancelable: true });
  env.canvas.dispatchEvent(lost);
  assert.ok(lost.defaultPrevented);
  assert.equal(env.canvas.dataset.webglState, "lost");
  assert.equal(env.frames.size, 0);
  env.canvas.dispatchEvent(new Event("webglcontextrestored"));
  assert.equal(env.canvas.dataset.webglState, "idle");
  assert.equal(env.calls.programs, 2);
  env.pointer();
  env.step(80);
  const draws = env.calls.draws;
  env.dispose();
  assert.ok(env.observers.every((observer) => observer.disconnected));
  assert.equal(env.frames.size, 0);
  env.pointer();
  env.step(1000);
  assert.equal(env.calls.draws, draws);
});

test("シェーダーが作れない場合も閲覧を妨げない", (t) => {
  const env = environment(t, { compile: false });
  assert.equal(env.canvas.dataset.webglState, "unavailable");
  assert.equal(env.frames.size, 0);
});

test("GPU復帰時に初期化が失敗しても再描画を繰り返さない", (t) => {
  const env = environment(t);
  env.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  t.mock.method(env.gl, "getShaderParameter", () => false);
  env.canvas.dispatchEvent(new Event("webglcontextrestored"));
  assert.equal(env.canvas.dataset.webglState, "unavailable");
  env.pointer();
  env.document.dispatchEvent(new Event("visibilitychange"));
  env.step(1000);
  assert.equal(env.canvas.dataset.webglState, "unavailable");
  assert.equal(env.frames.size, 0);
  assert.equal(env.calls.draws, 0);
});
