export const waterVertexShader = `
  uniform float uTime;
  uniform float uWaveStrength;
  varying vec3 vWorldPosition;
  varying float vWave;

  void main() {
    vec3 displaced = position;
    float waveA = sin(position.x * 0.72 + uTime * 0.75);
    float waveB = cos(position.y * 0.56 - uTime * 0.58);
    vWave = (waveA + waveB) * 0.5;
    displaced.z += vWave * uWaveStrength;
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
