import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { waterVertexShader } from "./shaders/water.vert.js";
import { waterFragmentShader } from "./shaders/water.frag.js";

const ASSET_EXTENTS = {
  "boat.glb": 3.82,
  "fish.glb": 2.15,
  "star.glb": 1.53,
  "coral-staghorn.glb": 3.2,
  "coral-brain.glb": 3,
  "coral-lettuce.glb": 2.42,
  "coral-sea-fan.glb": 3.22,
  "coral-table.glb": 3.25,
  "rocks.glb": 2.15,
  "sand.glb": 2,
};

function resolveAsset(scene, fileName) {
  return new URL(`models/${fileName}`, scene.sourceUrl).href;
}

function resolveTexture(scene, fileName) {
  return new URL(`textures/${fileName}`, scene.sourceUrl).href;
}

function removeEmbeddedWater(root) {
  const discarded = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.length && materials.every((material) => /water/i.test(material?.name || ""))) discarded.push(object);
  });
  discarded.forEach((object) => object.parent?.remove(object));
}

export function normalizeAsset(root, fileName) {
  removeEmbeddedWater(root);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error(`${fileName} contains no renderable geometry.`);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  const targetExtent = ASSET_EXTENTS[fileName] || 1;
  const scalar = targetExtent / Math.max(largest, 0.0001);
  const scaleX = fileName === "sand.glb" ? targetExtent / Math.max(size.x, 0.0001) : scalar;
  const scaleZ = fileName === "sand.glb" ? targetExtent / Math.max(size.z, 0.0001) : scalar;
  const centered = fileName === "fish.glb" || fileName === "star.glb";
  const normalization = new THREE.Group();
  normalization.name = `normalization:${fileName}`;
  normalization.add(root);
  normalization.scale.set(scaleX, scalar, scaleZ);
  const yOffset = fileName === "sand.glb" ? 0 : -(centered ? center.y : bounds.min.y) * scalar;
  normalization.position.set(-center.x * scaleX, yOffset, -center.z * scaleZ);
  const placementRoot = new THREE.Group();
  placementRoot.name = `normalized:${fileName}`;
  placementRoot.add(normalization);
  placementRoot.updateMatrixWorld(true);
  return placementRoot;
}

function cloneMaterial(material, underwater = false) {
  const result = material.clone();
  if ("roughness" in result) result.roughness = Math.max(0.32, Math.min(0.9, result.roughness));
  if ("metalness" in result) result.metalness = Math.min(0.18, result.metalness);
  result.toneMapped = !underwater;
  return result;
}

function setMeshShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = cast;
    object.receiveShadow = receive;
  });
}

function createShadowProxy(root) {
  const proxy = root.clone(true);
  proxy.name = "boat-underwater-shadow-proxy";
  proxy.traverse((object) => {
    if (!object.isMesh) return;
    const hideColor = (material) => {
      const result = material.clone();
      result.colorWrite = false;
      result.depthWrite = false;
      return result;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(hideColor)
      : hideColor(object.material);
    object.castShadow = true;
    object.receiveShadow = false;
  });
  return proxy;
}

export function instantiateAsset(root, placements, name, underwater = true) {
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  const meshes = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.getAttribute("position")) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = Array.isArray(object.material)
      ? object.material.map((entry) => cloneMaterial(entry, underwater))
      : cloneMaterial(object.material, underwater);
    const instances = new THREE.InstancedMesh(geometry, material, placements.length);
    instances.name = `${name}:${object.name || meshes.length}`;
    instances.castShadow = true;
    instances.receiveShadow = true;
    placements.forEach((placement, index) => instances.setMatrixAt(index, matrixFor(placement)));
    instances.instanceMatrix.needsUpdate = true;
    instances.userData.placementIds = placements.map((placement) => placement.id);
    meshes.push(instances);
    group.add(instances);
  });
  if (!meshes.length) throw new Error(`${name} contains no renderable meshes.`);
  group.name = name;
  return { group, meshes };
}

function firstRenderable(root, underwater = false) {
  root.updateMatrixWorld(true);
  let result = null;
  root.traverse((object) => {
    if (result || !object.isMesh || !object.geometry?.getAttribute("position")) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = Array.isArray(object.material)
      ? object.material.map((entry) => cloneMaterial(entry, underwater))
      : cloneMaterial(object.material, underwater);
    result = new THREE.Mesh(geometry, material);
  });
  if (!result) throw new Error("A loaded harbor asset contains no renderable geometry.");
  return result;
}

function matrixFor(placement, extraRotation = 0) {
  const position = new THREE.Vector3(...placement.position);
  const rotation = new THREE.Euler(...placement.rotation);
  rotation.y += extraRotation;
  const scale = new THREE.Vector3(placement.scale, placement.scale, placement.scale);
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
}

const ROCK_CLUSTER_PARTS = [
  { id: "a", offset: [-0.46, 0, 0.06], scale: 0.68, yaw: -0.42 },
  { id: "b", offset: [0.08, 0.035, -0.31], scale: 0.82, yaw: 0.18 },
  { id: "c", offset: [0.44, 0.012, 0.17], scale: 0.61, yaw: 0.73 },
  { id: "d", offset: [0.12, 0.018, 0.5], scale: 0.5, yaw: -0.88 },
];

export function expandRockClusters(clusters) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const localMatrix = new THREE.Matrix4();
  const finalMatrix = new THREE.Matrix4();
  const localQuaternion = new THREE.Quaternion();
  const localScale = new THREE.Vector3();

  return clusters.flatMap((cluster) => {
    const clusterMatrix = matrixFor(cluster);
    return ROCK_CLUSTER_PARTS.map((part) => {
      localMatrix.compose(
        position.set(...part.offset),
        localQuaternion.setFromEuler(new THREE.Euler(0, part.yaw, 0)),
        localScale.setScalar(part.scale),
      );
      finalMatrix.multiplyMatrices(clusterMatrix, localMatrix);
      finalMatrix.decompose(position, quaternion, scale);
      const rotation = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
      return {
        ...cluster,
        id: `${cluster.id}:rock-${part.id}`,
        clusterId: cluster.id,
        position: position.toArray(),
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: scale.x,
      };
    });
  });
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
    this.renderer.toneMappingExposure = scene.lighting?.exposure ?? 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x0a4245, 1);
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a4245);
    const environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    this.environmentMap = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    environmentGenerator.dispose();
    this.scene.environment = this.environmentMap;
    this.scene.environmentIntensity = 0.58;
    this.camera = new THREE.PerspectiveCamera(scene.camera.fov, 1, scene.camera.near, scene.camera.far);
    this.camera.position.set(...scene.camera.position);
    this.camera.lookAt(...scene.camera.target);

    this.underwaterGroup = new THREE.Group();
    this.surfaceGroup = new THREE.Group();
    this.scene.add(this.underwaterGroup, this.surfaceGroup);
    this.loader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    const gl = this.renderer.getContext();
    this.highPrecisionRefraction = this.renderer.capabilities.isWebGL2 && Boolean(gl.getExtension("EXT_color_buffer_float"));
    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: this.highPrecisionRefraction ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.renderTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.renderTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.renderTarget.depthTexture.format = THREE.DepthFormat;
    this.clockStartedAt = performance.now();
    this.frame = 0;
    this.running = false;
    this.disposed = false;
    this.quality = "auto";
    this.fishInstances = [];
    this.fishRecords = [];
    this.fishCurves = new Map();
    this.coralInstances = [];
    this.coralBatches = [];
    this.rockInstances = [];
    this.rockRecords = [];
    this.activeCounts = { rocks: scene.placements.rocks.length, coral: scene.placements.coral.length, fish: scene.placements.fish.length };
    this.stars = [];
    this.boat = null;
    this.boatShadowProxy = null;
    this.sun = null;
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
    const lighting = this.sceneData.lighting || {};
    const hemisphere = lighting.hemisphere || {};
    const sunConfig = lighting.sun || {};
    const fillConfig = lighting.fill || {};
    const ambient = new THREE.HemisphereLight(hemisphere.sky || 0xd6f4e9, hemisphere.ground || 0x17383b, hemisphere.intensity ?? 1.42);
    this.sun = new THREE.DirectionalLight(sunConfig.color || 0xffefd1, sunConfig.intensity ?? 4);
    this.sun.position.set(...(sunConfig.position || [-8.5, 15, 8]));
    this.sun.target.position.set(...(sunConfig.target || [0, -1.55, 0]));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 42;
    const shadowExtent = Math.min(15, this.sceneData.seabed.radius * 0.84);
    this.sun.shadow.camera.left = -shadowExtent;
    this.sun.shadow.camera.right = shadowExtent;
    this.sun.shadow.camera.top = shadowExtent;
    this.sun.shadow.camera.bottom = -shadowExtent;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.radius = 2.5;
    const fill = new THREE.DirectionalLight(fillConfig.color || 0x77bdc4, fillConfig.intensity ?? 0.38);
    fill.position.set(...(fillConfig.position || [8, 3.5, -7]));
    fill.castShadow = false;
    this.scene.add(ambient, this.sun, this.sun.target, fill);

    const rim = new THREE.Mesh(
      new THREE.RingGeometry(this.sceneData.seabed.radius * 0.72, this.sceneData.seabed.radius, 48),
      new THREE.MeshStandardMaterial({ color: 0x496f69, roughness: 0.92 }),
    );
    rim.material.toneMapped = false;
    rim.receiveShadow = true;
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = this.sceneData.seabed.y + 0.015;
    this.underwaterGroup.add(rim);
  }

  async load(fileName) {
    return this.loader.loadAsync(resolveAsset(this.sceneData, fileName));
  }

  async loadTexture(fileName, colorSpace = THREE.NoColorSpace) {
    const texture = await this.textureLoader.loadAsync(resolveTexture(this.sceneData, fileName));
    texture.colorSpace = colorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.channel = 0;
    return texture;
  }

  async addAssets() {
    const placements = this.sceneData.placements;
    const coralFiles = [...new Set(placements.coral.map((entry) => entry.asset))];
    const [boatGltf, fishGltf, rocksGltf, sandGltf, starGltf, sandAlbedo, sandNormal, terrainAo, ...corals] = await Promise.all([
      this.load(this.sceneData.boat.asset),
      this.load("fish.glb"),
      this.load("rocks.glb"),
      this.load(this.sceneData.seabed.asset || "sand.glb"),
      this.load("star.glb"),
      this.loadTexture(this.sceneData.seabed.albedoTexture, THREE.SRGBColorSpace),
      this.loadTexture(this.sceneData.seabed.normalTexture),
      this.loadTexture(this.sceneData.seabed.aoTexture),
      ...coralFiles.map((fileName) => this.load(fileName)),
    ]);

    this.boat = normalizeAsset(boatGltf.scene, this.sceneData.boat.asset);
    this.boat.name = "harbor-boat";
    this.boat.position.set(...this.sceneData.boat.position);
    this.boat.rotation.set(...this.sceneData.boat.rotation);
    this.boat.scale.setScalar(this.sceneData.boat.scale);
    setMeshShadows(this.boat);
    this.surfaceGroup.add(this.boat);
    this.boatShadowProxy = createShadowProxy(this.boat);
    this.underwaterGroup.add(this.boatShadowProxy);

    coralFiles.forEach((fileName, assetIndex) => {
      const records = placements.coral.filter((entry) => entry.asset === fileName);
      const root = normalizeAsset(corals[assetIndex].scene, fileName);
      const instances = instantiateAsset(root, records, `coral:${fileName}`);
      this.coralInstances.push(...instances.meshes);
      this.coralBatches.push({ records, meshes: instances.meshes });
      this.underwaterGroup.add(instances.group);
    });

    for (const definition of this.sceneData.curves.fish) {
      const curve = new THREE.CatmullRomCurve3(
        definition.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        definition.closed,
        "centripetal",
        0.5,
      );
      this.fishCurves.set(definition.id, { curve, definition });
    }
    this.fishRecords = placements.fish.map((record) => ({ ...record }));
    const fish = instantiateAsset(normalizeAsset(fishGltf.scene, "fish.glb"), this.fishRecords, "reef-fish");
    this.fishInstances = fish.meshes;
    this.fishInstances.forEach((instances) => instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage));
    this.underwaterGroup.add(fish.group);

    this.rockRecords = expandRockClusters(placements.rocks);
    const rocks = instantiateAsset(normalizeAsset(rocksGltf.scene, "rocks.glb"), this.rockRecords, "harbor-rocks");
    this.rockInstances = rocks.meshes;
    this.underwaterGroup.add(rocks.group);

    const sand = normalizeAsset(sandGltf.scene, "sand.glb");
    sand.name = "rippled-sand-terrain";
    sand.position.y = this.sceneData.seabed.y;
    sand.scale.set(this.sceneData.seabed.radius, 1, this.sceneData.seabed.radius);
    sand.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.toneMapped = false;
        material.map = sandAlbedo;
        material.normalMap = sandNormal;
        material.normalScale?.set(0.72, 0.72);
        material.aoMap = terrainAo;
        material.aoMapIntensity = 0.7;
        if ("roughness" in material) material.roughness = 0.96;
        if ("metalness" in material) material.metalness = 0;
        material.needsUpdate = true;
      });
    });
    sand.renderOrder = -1;
    this.underwaterGroup.add(sand);

    const starTemplate = firstRenderable(normalizeAsset(starGltf.scene, "star.glb"));
    placements.stars.forEach((record, index) => {
      const star = new THREE.Mesh(starTemplate.geometry, starTemplate.material);
      star.name = record.id;
      star.userData = { index, record, basePosition: [...record.position] };
      star.position.set(...record.position);
      star.rotation.set(...record.rotation);
      star.scale.setScalar(record.scale);
      star.castShadow = true;
      star.receiveShadow = true;
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
      glslVersion: THREE.GLSL3,
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: {
        uUnderwaterMap: { value: this.renderTarget.texture },
        uUnderwaterDepth: { value: this.renderTarget.depthTexture },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uWaveStrength: { value: this.options.quiet ? 0.035 : 0.065 },
        uClarity: { value: this.sceneData.water.clarity },
        uCameraNear: { value: this.camera.near },
        uCameraFar: { value: this.camera.far },
        uDistortionStrength: { value: this.options.quiet ? 0.0025 : 0.0065 },
        uDeepColor: { value: new THREE.Color(0x075054) },
        uShallowColor: { value: new THREE.Color(0x2a7471) },
        uAbsorption: { value: new THREE.Vector3(0.2, 0.075, 0.055) },
        uSunDirection: { value: this.sun.position.clone().sub(this.sun.target.position).normalize() },
        uSunColor: { value: this.sun.color.clone().multiplyScalar(this.sun.intensity / 4) },
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
    const targetScale = quality === "low" ? 0.35 : quality === "high" ? 0.75 : 0.55;
    this.renderTarget.setSize(Math.max(1, Math.floor(width * pixelRatio * targetScale)), Math.max(1, Math.floor(height * pixelRatio * targetScale)));
    this.waterMaterial?.uniforms.uViewport.value.set(this.canvas.width, this.canvas.height);
    if (this.waterMaterial) {
      this.waterMaterial.uniforms.uDistortionStrength.value = quality === "low" ? 0.0032 : this.options.quiet ? 0.0025 : 0.0065;
    }
    const shadowsEnabled = quality !== "low";
    this.renderer.shadowMap.enabled = shadowsEnabled;
    if (this.sun && shadowsEnabled) {
      const shadowSize = quality === "high" || (quality === "auto" && memory >= 8) ? 2048 : 1024;
      if (this.sun.shadow.mapSize.x !== shadowSize) {
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      }
      this.renderer.shadowMap.needsUpdate = true;
    }
    const requestedTier = quality === "high" || quality === "low" ? quality : "auto";
    const counts = this.sceneData.qualityCounts?.[requestedTier] || this.sceneData.qualityCounts?.auto || {};
    this.activeCounts = {
      rocks: Math.min(counts.rocks ?? this.sceneData.placements.rocks.length, this.sceneData.placements.rocks.length),
      coral: Math.min(counts.coral ?? this.sceneData.placements.coral.length, this.sceneData.placements.coral.length),
      fish: Math.min(counts.fish ?? this.fishRecords.length, this.fishRecords.length),
    };
    this.rockInstances.forEach((instances) => { instances.count = this.activeCounts.rocks * ROCK_CLUSTER_PARTS.length; });
    const activeCoralIds = new Set(this.sceneData.placements.coral.slice(0, this.activeCounts.coral).map(({ id }) => id));
    this.coralBatches.forEach(({ records, meshes }) => {
      const count = records.filter(({ id }) => activeCoralIds.has(id)).length;
      meshes.forEach((instances) => { instances.count = count; });
    });
    this.fishInstances.forEach((instances) => { instances.count = this.activeCounts.fish; });
    this.renderFrame((performance.now() - this.clockStartedAt) / 1000);
  }

  update(time) {
    const motion = this.options.quiet ? 0.45 : 1;
    if (this.boat) {
      this.boat.position.y = this.boatBaseY + Math.sin(time * 0.78) * 0.045 * motion;
      this.boat.rotation.z = Math.sin(time * 0.63) * 0.035 * this.sceneData.boat.rocking * motion;
      this.boat.rotation.x = Math.cos(time * 0.54) * 0.022 * motion;
      if (this.boatShadowProxy) {
        this.boatShadowProxy.position.copy(this.boat.position);
        this.boatShadowProxy.rotation.copy(this.boat.rotation);
        this.boatShadowProxy.scale.copy(this.boat.scale);
      }
    }

    this.fishRecords.slice(0, this.activeCounts.fish).forEach((record, index) => {
      const route = this.fishCurves.get(record.routeId);
      const t = ((record.curveT + record.phase * 0.12 + time * record.speed) % 1 + 1) % 1;
      const position = route.curve.getPointAt(t, this.tempPosition);
      const tangent = route.curve.getTangentAt(t);
      const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(record.laneOffset);
      position.add(lateral);
      position.y = route.definition.depth + Math.sin(time * 0.72 + record.bobPhase) * 0.08;
      const angle = Math.atan2(-tangent.z, tangent.x);
      this.tempMatrix.compose(position, this.tempQuaternion.setFromEuler(new THREE.Euler(0, angle, 0)), this.tempScale.setScalar(record.scale));
      this.fishInstances.forEach((instances) => instances.setMatrixAt(index, this.tempMatrix));
    });
    this.fishInstances.forEach((instances) => { instances.instanceMatrix.needsUpdate = true; });

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
    if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = true;
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
    return {
      engine: "three",
      threeRevision: THREE.REVISION,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      webgl2: this.renderer.capabilities.isWebGL2,
      refractionPrecision: this.highPrecisionRefraction ? "rgba16f" : "rgba8",
      shadows: this.renderer.shadowMap.enabled ? `${this.sun?.shadow.mapSize.x || 0}px pcf-soft` : "disabled",
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      activeCounts: {
        ...this.activeCounts,
        individualRocks: this.activeCounts.rocks * ROCK_CLUSTER_PARTS.length,
        stars: this.stars.length,
      },
      modelBytesBudget: 8912896,
    };
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
    this.environmentMap?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
