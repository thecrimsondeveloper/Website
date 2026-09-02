export const harborFragmentShader = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;
uniform float uCastTime;
uniform float uWaterSpeed;
uniform float uClarity;
uniform int uCaughtMask;
uniform float uQuiet;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 4; i++) {
    value += noise(p) * weight;
    p = p * 2.03 + 7.17;
    weight *= 0.5;
  }
  return value;
}

mat2 rotate2d(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float sdEllipse(vec2 p, vec2 radius) {
  return (length(p / radius) - 1.0) * min(radius.x, radius.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float softShape(float distanceValue, float feather) {
  return 1.0 - smoothstep(0.0, feather, distanceValue);
}

vec2 starPosition(int index, float time) {
  if (index == 0) return vec2(0.22 + sin(time * 0.31) * 0.026, 0.62 + cos(time * 0.27) * 0.035);
  if (index == 1) return vec2(0.78 + cos(time * 0.24) * 0.035, 0.55 + sin(time * 0.34) * 0.028);
  return vec2(0.66 + sin(time * 0.22 + 2.0) * 0.04, 0.80 + cos(time * 0.29) * 0.024);
}

float starShape(vec2 p, float radius) {
  float angle = atan(p.y, p.x);
  float spokes = 0.72 + 0.28 * cos(angle * 5.0);
  return length(p) - radius * spokes;
}

vec3 drawRock(vec3 color, vec2 p, vec2 center, vec2 radius, vec3 rockColor) {
  float d = sdEllipse(p - center, radius);
  float body = softShape(d, 0.012);
  float rim = softShape(abs(d + 0.006), 0.008);
  vec3 shaded = mix(rockColor * 0.55, rockColor, smoothstep(-radius.y, radius.y, p.y - center.y));
  return mix(color, shaded + rim * 0.08, body);
}

vec3 drawCoral(vec3 color, vec2 p, vec2 center, float scale, vec3 coralColor) {
  vec2 q = (p - center) / scale;
  float d = sdSegment(q, vec2(0.0, -0.16), vec2(0.0, 0.18));
  d = min(d, sdSegment(q, vec2(0.0, -0.02), vec2(-0.18, 0.15)));
  d = min(d, sdSegment(q, vec2(0.0, 0.06), vec2(0.2, 0.23)));
  d = min(d, sdSegment(q, vec2(-0.1, 0.08), vec2(-0.17, 0.25)));
  d = min(d, sdSegment(q, vec2(0.12, 0.15), vec2(0.13, 0.31)));
  float coral = 1.0 - smoothstep(0.035, 0.052, d);
  float glow = 1.0 - smoothstep(0.05, 0.16, d);
  color += coralColor * glow * 0.12;
  return mix(color, coralColor, coral * 0.88);
}

vec3 drawFish(vec3 color, vec2 p, vec2 center, float scale, float direction, vec3 fishColor) {
  vec2 q = p - center;
  q.x *= direction;
  float body = softShape(sdEllipse(q, vec2(0.065, 0.026) * scale), 0.006);
  float tail = softShape(sdEllipse(q + vec2(0.068, 0.0) * scale, vec2(0.026, 0.034) * scale), 0.006);
  float eye = softShape(length(q - vec2(0.036, 0.006) * scale) - 0.004 * scale, 0.003);
  color = mix(color, fishColor * 0.72, tail * 0.72);
  color = mix(color, fishColor, body);
  return mix(color, vec3(0.025, 0.08, 0.09), eye);
}

vec3 drawBoat(vec3 color, vec2 p, float time) {
  vec2 center = vec2(0.0, 0.02);
  vec2 q = rotate2d(sin(time * 0.72) * 0.035) * (p - center);
  float shadow = softShape(sdEllipse(q + vec2(0.018, -0.022), vec2(0.105, 0.205)), 0.035);
  color = mix(color, vec3(0.035, 0.13, 0.14), shadow * 0.30);

  float hull = softShape(sdEllipse(q, vec2(0.085, 0.178)), 0.008);
  float inner = softShape(sdEllipse(q + vec2(0.0, 0.015), vec2(0.057, 0.132)), 0.006);
  float bow = softShape(sdEllipse(q - vec2(0.0, 0.125), vec2(0.055, 0.062)), 0.006);
  color = mix(color, vec3(0.34, 0.16, 0.08), hull);
  color = mix(color, vec3(0.83, 0.62, 0.35), inner);
  color = mix(color, vec3(0.94, 0.83, 0.60), bow * 0.92);

  float benchA = softShape(sdSegment(q, vec2(-0.052, 0.035), vec2(0.052, 0.035)) - 0.007, 0.005);
  float benchB = softShape(sdSegment(q, vec2(-0.047, -0.055), vec2(0.047, -0.055)) - 0.007, 0.005);
  color = mix(color, vec3(0.22, 0.09, 0.045), max(benchA, benchB));

  float person = softShape(length(q - vec2(0.0, -0.015)) - 0.026, 0.006);
  color = mix(color, vec3(0.92, 0.49, 0.33), person);
  return color;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float time = uTime * uWaterSpeed;

  float waveA = sin(uv.y * 26.0 + time * 0.9) * 0.0028;
  float waveB = sin(uv.x * 35.0 - time * 1.15) * 0.0020;
  vec2 waterUv = uv + vec2(waveA, waveB) * uClarity;
  vec2 p = (waterUv - 0.5) * vec2(aspect, 1.0);

  float depth = smoothstep(0.02, 1.0, waterUv.y);
  vec3 deep = vec3(0.025, 0.20, 0.22);
  vec3 shallows = vec3(0.07, 0.39, 0.40);
  vec3 color = mix(deep, shallows, depth * 0.72 + 0.12);

  float sandPatch = fbm(waterUv * 3.1 + vec2(0.0, time * 0.018));
  color += vec3(0.16, 0.24, 0.19) * smoothstep(0.58, 0.94, sandPatch) * 0.26;

  float causticA = abs(sin((waterUv.x + noise(waterUv * 6.0) * 0.08) * 72.0 + time));
  float causticB = abs(sin((waterUv.y - noise(waterUv * 5.0) * 0.07) * 63.0 - time * 0.84));
  float caustics = pow(max(0.0, 1.0 - abs(causticA - causticB)), 12.0);
  color += vec3(0.32, 0.72, 0.65) * caustics * (0.045 + uClarity * 0.045);

  color = drawRock(color, p, vec2(-0.48, -0.14), vec2(0.19, 0.105), vec3(0.18, 0.30, 0.28));
  color = drawRock(color, p, vec2(0.50, 0.20), vec2(0.16, 0.10), vec3(0.22, 0.32, 0.28));
  color = drawRock(color, p, vec2(0.34, -0.34), vec2(0.115, 0.075), vec3(0.25, 0.31, 0.27));

  float sway = sin(time * 0.7) * 0.018;
  color = drawCoral(color, p, vec2(-0.47 + sway, -0.07), 0.82, vec3(0.95, 0.36, 0.30));
  color = drawCoral(color, p, vec2(0.48 - sway, 0.22), 0.66, vec3(0.98, 0.58, 0.30));
  color = drawCoral(color, p, vec2(0.34 + sway, -0.31), 0.46, vec3(0.72, 0.31, 0.43));

  vec2 fishA = vec2(-0.25 + fract(time * 0.028) * (aspect + 0.5), -0.19 + sin(time * 0.7) * 0.025);
  vec2 fishB = vec2(0.34 - fract(time * 0.021) * (aspect + 0.45), 0.31 + cos(time * 0.55) * 0.022);
  color = drawFish(color, p, fishA, 0.78, 1.0, vec3(0.90, 0.73, 0.30));
  color = drawFish(color, p, fishB, 0.58, -1.0, vec3(0.42, 0.81, 0.72));

  for (int i = 0; i < 3; i++) {
    if ((uCaughtMask & (1 << i)) != 0) continue;
    vec2 starUv = starPosition(i, uTime);
    vec2 starP = (waterUv - starUv) * vec2(aspect, 1.0);
    float star = 1.0 - smoothstep(0.012, 0.021, starShape(starP, 0.038));
    float glow = 1.0 - smoothstep(0.015, 0.12, length(starP));
    color += vec3(1.0, 0.83, 0.39) * glow * (0.16 + sin(uTime * 3.0 + float(i)) * 0.035);
    color = mix(color, vec3(1.0, 0.94, 0.67), star);
  }

  vec2 boatP = (waterUv - vec2(0.5, 0.43)) * vec2(aspect, 1.0);
  color = drawBoat(color, boatP, uTime);

  float sinceCast = uTime - uCastTime;
  if (sinceCast >= 0.0 && sinceCast < 2.8 && uQuiet < 0.5) {
    vec2 castP = (uPointer - 0.5) * vec2(aspect, 1.0);
    vec2 rodP = vec2(0.052, 0.015);
    float progress = smoothstep(0.0, 0.42, sinceCast);
    vec2 lineEnd = mix(rodP, castP, progress);
    float line = 1.0 - smoothstep(0.002, 0.006, sdSegment(p, rodP, lineEnd));
    color = mix(color, vec3(0.92, 0.88, 0.70), line * 0.72);

    float radius = sinceCast * 0.11;
    float ripple = 1.0 - smoothstep(0.004, 0.012, abs(length(p - castP) - radius));
    ripple *= 1.0 - smoothstep(1.5, 2.8, sinceCast);
    color += vec3(0.55, 0.90, 0.86) * ripple * 0.26;
  }

  float vignette = smoothstep(0.92, 0.26, length((uv - 0.5) * vec2(0.72, 1.0)));
  color *= 0.80 + vignette * 0.20;
  color += (hash21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  color = color / (color + vec3(0.78));
  color = pow(color, vec3(0.91));

  outColor = vec4(color, 1.0);
}
`;
