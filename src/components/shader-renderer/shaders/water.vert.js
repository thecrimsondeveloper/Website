export const waterVertexShader = `
  precision highp float;

  uniform float uTime;
  uniform float uWaveStrength;
  out vec3 vWorldPosition;
  out vec3 vWorldNormal;
  out vec2 vWaveSlope;
  out float vWave;

  void main() {
    vec3 displaced = position;
    float waveA = sin(position.x * 0.72 + uTime * 0.75);
    float waveB = cos(position.y * 0.56 - uTime * 0.58);
    vWave = (waveA + waveB) * 0.5;
    displaced.z += vWave * uWaveStrength;
    float dWaveDx = cos(position.x * 0.72 + uTime * 0.75) * 0.36 * uWaveStrength;
    float dWaveDy = -sin(position.y * 0.56 - uTime * 0.58) * 0.28 * uWaveStrength;
    vWaveSlope = vec2(dWaveDx, dWaveDy);
    vec3 localNormal = normalize(vec3(-dWaveDx, -dWaveDy, 1.0));
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
