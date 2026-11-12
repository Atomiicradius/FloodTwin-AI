// GLSL for the ambient water surface. One fullscreen quad, no render targets.
export const ambientVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

export const ambientFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uAspect;
  uniform float uRain;
  uniform vec3 uBase;
  uniform vec4 uRip[22];
  varying vec2 vUv;

  // slow, soft caustic light network: bright thin lines where warped waves cancel
  float caustic(vec2 p, float t) {
    vec2 q = p * 2.0;
    float v = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      q += 0.55 * vec2(sin(q.y * 1.3 + t * 0.7 + fi * 1.7), cos(q.x * 1.3 - t * 0.6 + fi * 2.3));
      float a = sin(q.x * 2.0) + sin(q.y * 2.0) + sin((q.x + q.y) * 1.4);
      v += pow(1.0 - abs(a) / 3.0, 7.0);
    }
    return v / 3.0;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec3 col = uBase;

    float cs = caustic(p, uTime * 0.05 + 11.0);
    col += vec3(0.004, 0.030, 0.046) * cs * 1.15;

    // expanding rain ripples: small, thin, quick rings that fade out
    float h = 0.0;
    for (int i = 0; i < 22; i++) {
      vec4 r = uRip[i];
      float age = uTime - r.z;
      if (age < 0.0 || age > 3.6) continue;
      float d = length(p - r.xy);
      float rad = 0.012 + age * 0.075;
      float w = 0.0042 + age * 0.0016;
      float ring = exp(-pow((d - rad) / w, 2.0));
      float ring2 = exp(-pow((d - rad * 0.62) / (w * 0.9), 2.0)) * 0.45;
      h += (ring + ring2) * exp(-age * 1.15) * r.w;
    }
    col += vec3(0.016, 0.085, 0.120) * h * (0.35 + uRain * 0.65);

    // very soft vignette keeps the edges quiet
    float v = smoothstep(1.25, 0.2, length(p));
    col = mix(uBase, col, 0.35 + 0.65 * v);
    gl_FragColor = vec4(col, 1.0);
  }
`
