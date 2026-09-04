export async function loadScene(url) {
  if (!url) throw new Error("The harbor scene URL is missing.");

  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Scene request failed with ${response.status}.`);
  const scene = await response.json();
  if (scene.schema !== "crimson-harbor/world/2") throw new Error("The harbor scene schema is unsupported.");
  if (!scene.camera || !scene.water || !scene.placements) throw new Error("The harbor scene is incomplete.");
  return { ...scene, sourceUrl: new URL(url, window.location.href).href };
}
