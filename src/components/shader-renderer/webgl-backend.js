import { fullscreenVertexShader } from "./shaders/fullscreen.vert.js";
import { harborFragmentShader } from "./shaders/harbor.frag.js";

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, fullscreenVertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, harborFragmentShader);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Shader link failed: ${message}`);
  }
  return program;
}

function starPosition(index, time) {
  if (index === 0) return [0.22 + Math.sin(time * 0.31) * 0.026, 0.62 + Math.cos(time * 0.27) * 0.035];
  if (index === 1) return [0.78 + Math.cos(time * 0.24) * 0.035, 0.55 + Math.sin(time * 0.34) * 0.028];
  return [0.66 + Math.sin(time * 0.22 + 2) * 0.04, 0.80 + Math.cos(time * 0.29) * 0.024];
}

export class WebGLBackend {
  constructor(canvas, scene, options = {}) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is unavailable");

    this.canvas = canvas;
    this.gl = gl;
    this.scene = scene;
    this.options = options;
    this.program = createProgram(gl);
    this.frame = 0;
    this.running = false;
    this.startedAt = performance.now();
    this.lastTime = 0;
    this.pointer = [0.5, 0.5];
    this.castTime = -10;
    this.caughtMask = 0;
    this.resetTimer = 0;
    this.total = Number.parseInt(localStorage.getItem("crimson-star-count") || "0", 10) || 0;
    this.onStarCaught = options.onStarCaught || (() => {});

    this.uniforms = Object.fromEntries(
      ["uResolution", "uTime", "uPointer", "uCastTime", "uWaterSpeed", "uClarity", "uCaughtMask", "uQuiet"]
        .map((name) => [name, gl.getUniformLocation(this.program, name)])
    );

    this.loop = this.loop.bind(this);
  }

  resize(width, height, quality = "auto") {
    const memory = navigator.deviceMemory || 4;
    const autoScale = memory <= 2 ? 0.75 : 1;
    const requestedScale = quality === "low" ? 0.68 : quality === "high" ? 1.15 : autoScale;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, requestedScale * 1.5);
    const targetWidth = Math.max(1, Math.floor(width * pixelRatio));
    const targetHeight = Math.max(1, Math.floor(height * pixelRatio));
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
      this.gl.viewport(0, 0, targetWidth, targetHeight);
    }
  }

  castAt(x, y) {
    const time = (performance.now() - this.startedAt) / 1000;
    this.pointer = [x, y];
    this.castTime = time;

    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    let caught = -1;
    let closest = 0.11;
    for (let index = 0; index < 3; index += 1) {
      if ((this.caughtMask & (1 << index)) !== 0) continue;
      const star = starPosition(index, time);
      const distance = Math.hypot((x - star[0]) * aspect, y - star[1]);
      if (distance < closest) {
        closest = distance;
        caught = index;
      }
    }

    if (caught >= 0) {
      this.caughtMask |= 1 << caught;
      this.total += 1;
      localStorage.setItem("crimson-star-count", String(this.total));
      this.onStarCaught({ total: this.total, index: caught });
      if (this.caughtMask === 7) {
        window.clearTimeout(this.resetTimer);
        this.resetTimer = window.setTimeout(() => { this.caughtMask = 0; }, 2600);
      }
    }
    this.render(time);
  }

  render(time) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.uTime, time);
    gl.uniform2f(this.uniforms.uPointer, this.pointer[0], this.pointer[1]);
    gl.uniform1f(this.uniforms.uCastTime, this.castTime);
    gl.uniform1f(this.uniforms.uWaterSpeed, this.scene.water.speed);
    gl.uniform1f(this.uniforms.uClarity, this.scene.water.clarity);
    gl.uniform1i(this.uniforms.uCaughtMask, this.caughtMask);
    gl.uniform1f(this.uniforms.uQuiet, this.options.quiet ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  loop(now) {
    if (!this.running) return;
    const time = (now - this.startedAt) / 1000;
    this.lastTime = time;
    this.render(time);
    this.frame = requestAnimationFrame(this.loop);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.frame = requestAnimationFrame(this.loop);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  dispose() {
    this.pause();
    clearTimeout(this.resetTimer);
    this.gl.deleteProgram(this.program);
    const loseContext = this.gl.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
  }
}
