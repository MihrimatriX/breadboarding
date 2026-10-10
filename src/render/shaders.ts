/**
 * Die katmanı shader'ı. Her köşe hangi düğüme ait olduğunu bilir; fragment
 * shader düğüm durumunu (0/1) bir veri dokusundan okur. Böylece 1.700 düğümün
 * durumu her karede tek bir doku yüklemesiyle güncellenir.
 */
export const dieVertex = /* glsl */ `
attribute float aNode;
varying float vNode;
varying vec3 vNormal;
void main() {
  vNode = aNode;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const dieFragment = /* glsl */ `
uniform sampler2D uState;
uniform vec2 uTexSize;
uniform vec3 uColor;
uniform vec3 uHighColor;
uniform float uOpacity;
uniform float uSelected;
uniform float uHovered;
uniform float uTime;
uniform float uGlow;
varying float vNode;
varying vec3 vNormal;

void main() {
  float id = floor(vNode + 0.5);
  vec2 uv = vec2((mod(id, uTexSize.x) + 0.5) / uTexSize.x, (floor(id / uTexSize.x) + 0.5) / uTexSize.y);
  float on = step(0.5, texture2D(uState, uv).r);

  vec3 L = normalize(vec3(0.35, 0.9, 0.45));
  float diffuse = 0.38 + 0.62 * max(dot(normalize(vNormal), L), 0.0);

  vec3 color = uColor * 0.55 * diffuse;
  float alpha = uOpacity;

  if (on > 0.5) {
    color = mix(color, uHighColor * (1.15 + uGlow) * diffuse, 0.68);
    alpha = min(1.0, uOpacity + 0.3);
  }
  if (abs(id - uHovered) < 0.5) {
    color = mix(color, vec3(0.55, 1.0, 1.0) * 1.3, 0.55);
    alpha = 1.0;
  }
  if (abs(id - uSelected) < 0.5) {
    float pulse = 0.75 + 0.25 * sin(uTime * 6.0);
    color = vec3(1.5) * pulse * diffuse + 0.2;
    alpha = 1.0;
  }
  gl_FragColor = vec4(color, alpha);
}
`;
