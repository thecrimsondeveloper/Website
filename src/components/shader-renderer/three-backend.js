import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { waterVertexShader } from "./shaders/water.vert.js";
import { waterFragmentShader } from "./shaders/water.frag.js";

const CORAL_COLORS = {
  "coral-staghorn.glb": 0xe47c67,
  "coral-brain.glb": 0xc99a61,
  "coral-lettuce.glb": 0xcf7b89,
  "coral-sea-fan.glb": 0xb96f8f,
  "coral-table.glb": 0xe79a6b,
};

function resolveAsset(scene, fileName) {
  return new URL(`models/${fileName}`, scene.sourceUrl).href;
}

function mergedGeometry(root, useVertexColors = false) {
  root.updateMatrixWorld(true);
  const geometries = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.getAttribute("position")) return;
    let geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (!new Set(["position", "normal"]).has(name)) geometry.deleteAttribute(name);
    }
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (useVertexColors) {
      const sourceColor = object.material?.color ?? new THREE.Color(0xffffff);
      const colors = new Float32Array(geometry.getAttribute("position").count * 3);
      for (let index = 0; index < colors.length; index += 3) {
        colors[index] = sourceColor.r;
        colors[index + 1] = sourceColor.g;
        colors[index + 2] = sourceColor.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometries.push(geometry);
  });
  if (!geometries.length) throw new Error("A loaded harbor asset contains no renderable geometry.");
  const result = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!result) throw new Error("A harbor asset could not be merged for instancing.");
  result.computeBoundingSphere();
  return result;
}

function matrixFor(placement, extraRotation = 0) {
  const position = new THREE.Vector3(...placement.position);
  const rotation = new THREE.Euler(...placement.rotation);
  rotation.y += extraRotation;
  const scale = new THREE.Vector3(placement.scale, placement.scale, placement.scale);
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
}

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose?.();
}

function readStoredStarCount() {
  try {
    return Number.parseInt(localStorage.getItem("crimson-star-count") || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function storeStarCount(total) {
  try {
    localStorage.setItem("crimson-star-count", String(total));
  } catch {
    // Persistence is optional; the interaction still works when storage is blocked.
  }
}

export class ThreeBackend {
  constructor(canvas, scene, options = {}) {
    this.canvas = canvas;
    this.sceneData = scene;
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x0a4245, 1);
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a4245);
    this.camera = new THREE.PerspectiveCamera(scene.camera.fov, 1, scene.camera.near, scene.camera.far);
    this.camera.position.set(...scene.camera.position);
    this.camera.lookAt(...scene.camera.target);

    this.underwaterGroup = new THREE.Group();
    this.surfaceGroup = new THREE.Group();
    this.scene.add(this.underwaterGroup, this.surfaceGroup);
    this.loader = new GLTFLoader();
    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.clockStartedAt = performance.now();
    this.frame = 0;
    this.running = false;
    this.disposed = false;
    this.quality = "auto";
    this.fishInstances = null;
    this.fishRecords = [];
    this.coralInstances = [];
    this.stars = [];
    this.boat = null;
    this.boatBaseY = scene.boat.position[1];
    this.raycaster = new THREE.Raycaster();
    this.caught = new Set();
    this.total = readStoredStarCount();
    this.cast = null;
    this.resetTimer = 0;
    this.tempMatrix = new THREE.Matrix4();
    this.tempPosition = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
    this.loop = this.loop.bind(this);
  }

  async initialize() {
    this.addEnvironment();
    await this.addAssets();
    this.addWater();
    this.renderFrame(0);
  }

  addEnvironment() {
    const ambient = new THREE.HemisphereLight(0xd6f4e9, 0x25494a, 2.35);
    const sun = new THREE.DirectionalLight(0xffefd1, 3.1);
    sun.position.set(-6, 12, 8);
    this.scene.add(ambient, sun);

    const seabed = new THREE.Mesh(
      new THREE.CircleGeometry(this.sceneData.seabed.radius, 48),
      new THREE.MeshStandardMaterial({ color: this.sceneData.seabed.color, roughness: 0.96, metalness: 0 }),
    );
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = this.sceneData.seabed.y;
    this.underwaterGroup.add(seabed);

    const rim = new THREE.Mesh(
      new THREE.RingGeometry(this.sceneData.seabed.radius * 0.72, this.sceneData.seabed.radius, 48),
      new THREE.MeshStandardMaterial({ color: 0x496f69, roughness: 0.92 }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = this.sceneData.seabed.y + 0.015;
    this.underwaterGroup.add(rim);
  }

  async load(fileName) {
    return this.loader.loadAsync(resolveAsset(this.sceneData, fileName));
  }

  async addAssets() {
    const placements = this.sceneData.placements;
    const coralFiles = [...new Set(placements.coral.map((entry) => entry.asset))];
    const [boatGltf, fishGltf, rocksGltf, starGltf, ...corals] = await Promise.all([
      this.load(this.sceneData.boat.asset),
      this.load("fish.glb"),
      this.load("rocks.glb"),
      this.load("star.glb"),
      ...coralFiles.map((fileName) => this.load(fileName)),
    ]);

    this.boat = boatGltf.scene;
    this.boat.name = "harbor-boat";
    this.boat.position.set(...this.sceneData.boat.position);
    this.boat.rotation.set(...this.sceneData.boat.rotation);
    this.boat.scale.setScalar(this.sceneData.boat.scale);
    this.surfaceGroup.add(this.boat);

    coralFiles.forEach((fileName, assetIndex) => {
      const records = placements.coral.filter((entry) => entry.asset === fileName);
      const geometry = mergedGeometry(corals[assetIndex].scene);
      const material = new THREE.MeshStandardMaterial({ color: CORAL_COLORS[fileName] ?? 0xd7806d, roughness: 0.82, metalness: 0 });
      const instances = new THREE.InstancedMesh(geometry, material, records.length);
      instances.name = `coral:${fileName}`;
      records.forEach((record, index) => instances.setMatrixAt(index, matrixFor(record)));
      instances.instanceMatrix.needsUpdate = true;
      this.coralInstances.push(instances);
      this.underwaterGroup.add(instances);
    });

    const fishGeometry = mergedGeometry(fishGltf.scene, true);
    const fishMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0 });
    this.fishInstances = new THREE.InstancedMesh(fishGeometry, fishMaterial, placements.fish.length);
    this.fishInstances.name = "reef-fish";
    this.fishRecords = placements.fish.map((record) => ({ ...record, origin: [...record.position] }));
    this.fishRecords.forEach((record, index) => this.fishInstances.setMatrixAt(index, matrixFor(record)));
    this.fishInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.underwaterGroup.add(this.fishInstances);

    const rockGeometry = mergedGeometry(rocksGltf.scene, true);
    const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    const rockInstances = new THREE.InstancedMesh(rockGeometry, rockMaterial, placements.rocks.length);
    rockInstances.name = "harbor-rocks";
    placements.rocks.forEach((record, index) => rockInstances.setMatrixAt(index, matrixFor(record)));
    this.underwaterGroup.add(rockInstances);

    const starGeometry = mergedGeometry(starGltf.scene);
    placements.stars.forEach((record, index) => {
      const star = new THREE.Mesh(
        starGeometry,
        new THREE.MeshStandardMaterial({ color: 0xffdb82, emissive: 0x8f541c, emissiveIntensity: 0.72, roughness: 0.32, metalness: 0.08 }),
      );
      star.name = record.id;
      star.userData = { index, record, basePosition: [...record.position] };
      star.position.set(...record.position);
      star.rotation.set(...record.rotation);
      star.scale.setScalar(record.scale);
      this.stars.push(star);
      this.surfaceGroup.add(star);
    });

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.fishingLine = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xf6e5b8, transparent: true, opacity: 0 }));
    this.fishingLine.frustumCulled = false;
    this.surfaceGroup.add(this.fishingLine);
  }

  addWater() {
    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: {
        uUnderwaterMap: { value: this.renderTarget.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uWaveStrength: { value: this.options.quiet ? 0.035 : 0.065 },
        uClarity: { value: this.sceneData.water.clarity },
        uDeepColor: { value: new THREE.Color(0x075054) },
        uShallowColor: { value: new THREE.Color(0x2a7471) },
      },
      depthWrite: true,
      depthTest: true,
      transparent: false,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(this.sceneData.water.size, this.sceneData.water.size, 48, 48), this.waterMaterial);
    this.water.name = "transparent-water";
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.sceneData.water.y;
    this.scene.add(this.water);
  }

  resize(width, height, quality = "auto") {
    if (!width || !height || this.disposed) return;
    this.quality = quality;
    const memory = navigator.deviceMemory || 4;
    const autoScale = memory <= 2 ? 0.7 : memory <= 4 ? 0.9 : 1;
    const requestedScale = quality === "low" ? 0.62 : quality === "high" ? 1.05 : autoScale;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, requestedScale * 1.5);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const targetScale = quality === "low" ? 0.3 : 0.5;
    this.renderTarget.setSize(Math.max(1, Math.floor(width * pixelRatio * targetScale)), Math.max(1, Math.floor(height * pixelRatio * targetScale)));
    this.waterMaterial?.uniforms.uResolution.value.set(this.canvas.width, this.canvas.height);
    if (this.fishInstances) {
      this.fishInstances.count = quality === "low" ? Math.max(4, Math.ceil(this.fishRecords.length / 2)) : this.fishRecords.length;
    }
    this.renderFrame((performance.now() - this.clockStartedAt) / 1000);
  }

  update(time) {
    const motion = this.options.quiet ? 0.45 : 1;
    if (this.boat) {
      this.boat.position.y = this.boatBaseY + Math.sin(time * 0.78) * 0.045 * motion;
      this.boat.rotation.z = Math.sin(time * 0.63) * 0.035 * this.sceneData.boat.rocking * motion;
      this.boat.rotation.x = Math.cos(time * 0.54) * 0.022 * motion;
    }

    this.fishRecords.forEach((record, index) => {
      const angle = record.rotation[1] + Math.sin(time * record.speed + record.phase) * 0.8;
      const position = [record.origin[0] + Math.cos(time * record.speed + record.phase) * record.orbit, record.origin[1] + Math.sin(time * 0.72 + record.phase) * 0.12, record.origin[2] + Math.sin(time * record.speed + record.phase) * record.orbit];
      this.tempMatrix.compose(this.tempPosition.set(...position), this.tempQuaternion.setFromEuler(new THREE.Euler(0, angle, 0)), this.tempScale.setScalar(record.scale));
      this.fishInstances?.setMatrixAt(index, this.tempMatrix);
    });
    if (this.fishInstances) this.fishInstances.instanceMatrix.needsUpdate = true;

    this.stars.forEach((star) => {
      const record = star.userData.record;
      if (!this.caught.has(record.id)) {
        star.position.y = star.userData.basePosition[1] + Math.sin(time * 0.9 + record.phase) * 0.14 * motion;
        star.rotation.z += 0.004 * motion;
      }
    });

    if (this.cast) this.updateCast(time);
    if (this.waterMaterial) this.waterMaterial.uniforms.uTime.value = time;
  }

  updateCast(time) {
    const elapsed = time - this.cast.startedAt;
    const star = this.cast.star;
    const target = new THREE.Vector3();
    this.boat.getWorldPosition(target);
    target.y += 0.7;
    if (star?.visible) {
      const progress = Math.min(1, elapsed / 0.85);
      const eased = 1 - (1 - progress) ** 3;
      star.position.lerpVectors(this.cast.start, target, eased);
      star.rotation.y += 0.08;
      if (progress >= 1) star.visible = false;
    }
    const linePositions = this.fishingLine.geometry.getAttribute("position");
    const lineEnd = star?.visible ? star.position : target;
    linePositions.setXYZ(0, target.x + 0.35, target.y + 0.55, target.z + 0.55);
    linePositions.setXYZ(1, lineEnd.x, lineEnd.y, lineEnd.z);
    linePositions.needsUpdate = true;
    this.fishingLine.material.opacity = elapsed < 0.85 ? 0.86 : Math.max(0, 1 - (elapsed - 0.85) * 2.2);
    if (elapsed > 1.4) this.cast = null;
  }

  catchStar(star) {
    const id = star.userData.record.id;
    if (this.caught.has(id)) return;
    this.caught.add(id);
    this.total += 1;
    storeStarCount(this.total);
    this.cast = { star, start: star.position.clone(), startedAt: (performance.now() - this.clockStartedAt) / 1000 };
    this.options.onStarCaught?.({ total: this.total, index: star.userData.index });
    if (this.caught.size === this.stars.length) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = window.setTimeout(() => {
        this.caught.clear();
        this.stars.forEach((item) => {
          item.visible = true;
          item.position.set(...item.userData.basePosition);
        });
      }, 2800);
    }
  }

  castAt(x, y) {
    const candidates = this.stars.filter((star) => star.visible && !this.caught.has(star.userData.record.id));
    this.raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, y * 2 - 1), this.camera);
    const hit = this.raycaster.intersectObjects(candidates, false)[0];
    if (hit) this.catchStar(hit.object);
  }

  castAtStar() {
    const star = this.stars.find((candidate) => candidate.visible && !this.caught.has(candidate.userData.record.id));
    if (star) this.catchStar(star);
  }

  renderFrame(time) {
    if (!this.water || this.disposed) return;
    this.renderer.info.reset();
    this.update(time);
    this.water.visible = false;
    this.surfaceGroup.visible = false;
    this.underwaterGroup.visible = true;
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.water.visible = true;
    this.surfaceGroup.visible = true;
    this.underwaterGroup.visible = false;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.underwaterGroup.visible = true;
  }

  loop(now) {
    if (!this.running) return;
    this.renderFrame((now - this.clockStartedAt) / 1000);
    this.frame = requestAnimationFrame(this.loop);
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.frame = requestAnimationFrame(this.loop);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  diagnostics() {
    const gl = this.renderer.getContext();
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { engine: "three", threeRevision: THREE.REVISION, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, modelBytesBudget: 5242880 };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    window.clearTimeout(this.resetTimer);
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
      else disposeMaterial(object.material);
    });
    this.renderTarget.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
