export const waterFragmentShader = `
  uniform sampler2D uUnderwaterMap;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uClarity;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  varying vec3 vWorldPosition;
  varying float vWave;

  float caustic(vec2 point) {
    vec2 p = point * 0.55;
    float a = sin(p.x * 3.1 + uTime * 0.72) + cos(p.y * 3.7 - uTime * 0.54);
    float b = sin((p.x + p.y) * 4.4 - uTime * 0.43);
    return pow(max(0.0, (a + b) / 3.0), 3.0);
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    vec2 distortion = vec2(
      sin(vWorldPosition.z * 1.1 + uTime * 0.62),
      cos(vWorldPosition.x * 1.25 - uTime * 0.55)
    ) * 0.0065;
    vec3 below = texture2D(uUnderwaterMap, clamp(screenUv + distortion, 0.002, 0.998)).rgb;
    float light = caustic(vWorldPosition.xz);
    float horizon = smoothstep(-9.0, 9.0, vWorldPosition.z);
    vec3 tint = mix(uDeepColor, uShallowColor, 0.26 + horizon * 0.16 + vWave * 0.05);
    vec3 water = mix(tint, below, clamp(uClarity, 0.0, 1.0));
    water += vec3(0.18, 0.34, 0.29) * light * 0.34;
    float glint = pow(max(0.0, sin((vWorldPosition.x - vWorldPosition.z) * 1.7 + uTime)), 18.0);
    water += vec3(0.32, 0.48, 0.43) * glint * 0.26;
    gl_FragColor = vec4(water, 1.0);
  }
`;
