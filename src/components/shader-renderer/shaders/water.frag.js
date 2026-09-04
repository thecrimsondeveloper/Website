export const waterFragmentShader = `
  precision highp float;
  precision highp int;

  uniform sampler2D uUnderwaterMap;
  uniform sampler2D uUnderwaterDepth;
  uniform vec2 uViewport;
  uniform float uTime;
  uniform float uClarity;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uDistortionStrength;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uAbsorption;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  in vec3 vWorldPosition;
  in vec3 vWorldNormal;
  in vec2 vWaveSlope;
  in float vWave;
  out vec4 fragColor;

  float perspectiveDepthToViewZ(float depth) {
    return (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * depth - uCameraFar);
  }

  vec2 waveSlope(vec2 point) {
    vec2 flowA = vec2(
      sin(point.x * 0.78 + point.y * 0.31 + uTime * 0.56),
      cos(point.y * 0.92 - point.x * 0.27 - uTime * 0.49)
    );
    vec2 flowB = vec2(
      cos((point.x - point.y) * 1.43 - uTime * 0.34),
      sin((point.x + point.y) * 1.18 + uTime * 0.41)
    );
    vec2 flowC = vec2(
      sin(point.x * 3.7 - point.y * 2.8 + uTime * 0.93),
      cos(point.y * 3.3 + point.x * 2.5 - uTime * 0.88)
    );
    return normalize(flowA + flowB * 0.62 + flowC * 0.2 + vec2(0.001));
  }

  float caustic(vec2 point) {
    vec2 p = point * 0.55;
    float a = sin(p.x * 3.1 + uTime * 0.72) + cos(p.y * 3.7 - uTime * 0.54);
    float b = sin((p.x + p.y) * 4.4 - uTime * 0.43);
    return pow(max(0.0, (a + b) / 3.0), 3.0);
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / max(uViewport, vec2(1.0));
    float baseDepth = texture(uUnderwaterDepth, screenUv).r;
    float waterViewZ = perspectiveDepthToViewZ(gl_FragCoord.z);
    float sceneViewZ = baseDepth >= 0.9999 ? waterViewZ - 8.0 : perspectiveDepthToViewZ(baseDepth);
    float thickness = clamp(abs(sceneViewZ - waterViewZ), 0.12, 9.0);

    vec2 slope = waveSlope(vWorldPosition.xz) + vWaveSlope * 4.2;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 surfaceNormal = normalize(vWorldNormal + vec3(slope.x, 0.0, slope.y) * 0.052);
    float facing = clamp(abs(dot(viewDirection, surfaceNormal)), 0.0, 1.0);
    float angleGuard = smoothstep(0.08, 0.48, facing);
    vec2 distortion = slope * uDistortionStrength * angleGuard * mix(0.28, 1.0, smoothstep(0.15, 4.0, thickness));
    vec2 distortedUv = clamp(screenUv + distortion, 0.003, 0.997);
    float distortedDepth = texture(uUnderwaterDepth, distortedUv).r;
    float edgeMismatch = abs(distortedDepth - baseDepth);
    distortedUv = mix(distortedUv, screenUv, smoothstep(0.006, 0.035, edgeMismatch));

    vec3 below = texture(uUnderwaterMap, distortedUv).rgb;
    vec3 transmittance = exp(-uAbsorption * thickness);
    vec3 absorbed = below * transmittance + uShallowColor * (1.0 - transmittance);
    float light = caustic(vWorldPosition.xz) * exp(-thickness * 0.13) * smoothstep(0.2, 2.8, thickness);
    float horizon = smoothstep(-9.0, 9.0, vWorldPosition.z);
    vec3 tint = mix(uDeepColor, uShallowColor, 0.26 + horizon * 0.16 + vWave * 0.05);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(viewDirection, surfaceNormal), 0.0), 5.0);
    vec3 water = mix(tint, absorbed, clamp(uClarity, 0.0, 1.0));
    vec3 reflectedDirection = reflect(-viewDirection, surfaceNormal);
    float reflectedSky = smoothstep(-0.08, 0.88, reflectedDirection.y);
    vec3 skyReflection = mix(vec3(0.055, 0.23, 0.25), vec3(0.56, 0.74, 0.7), reflectedSky);
    water = mix(water, skyReflection, fresnel * 0.62);
    water += uSunColor * vec3(0.23, 0.31, 0.22) * light * 0.44;
    vec3 halfDirection = normalize(viewDirection + normalize(uSunDirection));
    float glint = pow(max(dot(surfaceNormal, halfDirection), 0.0), 120.0);
    water += uSunColor * glint * 0.68;
    fragColor = linearToOutputTexel(vec4(toneMapping(water), 1.0));
  }
`;
