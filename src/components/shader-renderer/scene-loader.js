const defaultWorld = {
  seed: 604,
  water: { speed: 0.72, clarity: 0.78 },
  boat: { position: [0.5, 0.54], rocking: 0.8 },
  stars: { count: 3 },
};

export async function loadScene(url) {
  if (!url) return defaultWorld;

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Scene request failed with ${response.status}`);
    const scene = await response.json();
    return {
      ...defaultWorld,
      ...scene,
      water: { ...defaultWorld.water, ...scene.water },
      boat: { ...defaultWorld.boat, ...scene.boat },
      stars: { ...defaultWorld.stars, ...scene.stars },
    };
  } catch {
    return defaultWorld;
  }
}
