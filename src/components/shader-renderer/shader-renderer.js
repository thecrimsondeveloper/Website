import { loadScene } from "./scene-loader.js";
import { MediaFallback } from "./media-fallback.js";
import { WebGLBackend } from "./webgl-backend.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: block; position: relative; overflow: hidden; background: #063638; contain: layout paint size; }
    .frame, canvas, video, ::slotted(img) { width: 100%; height: 100%; }
    .frame { position: relative; overflow: hidden; }
    canvas, video, ::slotted(img) { position: absolute; inset: 0; display: block; object-fit: cover; transition: opacity 500ms ease; }
    canvas { opacity: 0; touch-action: none; }
    video { opacity: 0; }
    ::slotted(img) { opacity: 1; }
    :host([data-mode="webgl"]) canvas { opacity: 1; }
    :host([data-mode="webgl"]) ::slotted(img), :host([data-mode="video"]) ::slotted(img) { opacity: 0; }
    :host([data-mode="video"]) video { opacity: 1; }
    .cast-hint { position: absolute; right: 18px; bottom: 18px; padding: 7px 10px; color: rgba(239,244,230,.74); border: 1px solid rgba(239,244,230,.22); font: 600 10px/1 system-ui,sans-serif; letter-spacing: .16em; text-transform: uppercase; pointer-events: none; }
    :host(:not([interactive])) .cast-hint { display: none; }
    @media (max-width: 540px) { .cast-hint { right: 12px; bottom: 12px; } }
    @media (prefers-reduced-motion: reduce) { canvas, video, ::slotted(img) { transition: none; } }
  </style>
  <div class="frame">
    <slot name="fallback"></slot>
    <video aria-hidden="true"></video>
    <canvas aria-hidden="true"></canvas>
    <span class="cast-hint">Tap a star</span>
  </div>
`;

class ShaderRenderer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    this.canvas = this.shadowRoot.querySelector("canvas");
    this.video = this.shadowRoot.querySelector("video");
    this.fallback = new MediaFallback(this, this.video);
    this.backend = null;
    this.resizeObserver = null;
    this.visibilityObserver = null;
    this.disposed = false;
    this.handlePointer = this.handlePointer.bind(this);
    this.handleKey = this.handleKey.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
  }

  connectedCallback() {
    this.disposed = false;
    this.dataset.mode = "image";
    this.canvas.addEventListener("pointerdown", this.handlePointer);
    this.addEventListener("keydown", this.handleKey);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this);
    this.visibilityObserver = new IntersectionObserver(this.handleVisibility, { threshold: 0.02 });
    this.visibilityObserver.observe(this);
    this.start();
  }

  disconnectedCallback() {
    this.dispose();
  }

  async start() {
    if (this.backend || this.disposed) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      this.setMode("image");
      return;
    }

    try {
      const scene = await loadScene(this.getAttribute("scene"));
      if (this.disposed) return;
      this.backend = new WebGLBackend(this.canvas, scene, {
        quiet: this.hasAttribute("quiet"),
        onStarCaught: (detail) => this.dispatchEvent(new CustomEvent("star-caught", { detail })),
      });
      this.resize();
      this.backend.start();
      this.fallback.showWebGL();
      this.setMode("webgl");
      this.dispatchEvent(new CustomEvent("renderer-ready", { detail: { mode: "webgl" } }));
    } catch (error) {
      const videoReady = await this.fallback.showVideo(this.getAttribute("fallback-video"));
      this.setMode(videoReady ? "video" : "image");
      this.dispatchEvent(new CustomEvent("renderer-error", { detail: { message: error.message } }));
    }
  }

  pause() {
    this.backend?.pause();
    this.video.pause();
  }

  resume() {
    if (document.hidden) return;
    this.backend?.start();
    if (this.dataset.mode === "video") this.video.play().catch(() => this.setMode("image"));
  }

  castAt(x = 0.5, y = 0.5) {
    this.backend?.castAt(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
  }

  setQuality(quality) {
    this.setAttribute("quality", quality);
    this.resize();
  }

  resize() {
    const bounds = this.getBoundingClientRect();
    this.backend?.resize(bounds.width, bounds.height, this.getAttribute("quality") || "auto");
  }

  handlePointer(event) {
    if (!this.hasAttribute("interactive")) return;
    const bounds = this.canvas.getBoundingClientRect();
    this.castAt((event.clientX - bounds.left) / bounds.width, 1 - (event.clientY - bounds.top) / bounds.height);
  }

  handleKey(event) {
    if (!this.hasAttribute("interactive") || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    this.castAt(0.66, 0.80);
  }

  handleVisibility(entries) {
    if (entries[0]?.isIntersecting) this.resume();
    else this.pause();
  }

  setMode(mode) {
    if (this.dataset.mode === mode) return;
    this.dataset.mode = mode;
    this.dispatchEvent(new CustomEvent("renderer-mode-change", { detail: { mode } }));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handlePointer);
    this.removeEventListener("keydown", this.handleKey);
    this.backend?.dispose();
    this.backend = null;
    this.fallback.dispose();
  }
}

if (!customElements.get("shader-renderer")) {
  customElements.define("shader-renderer", ShaderRenderer);
}

export { ShaderRenderer };
