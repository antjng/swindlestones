import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// A dozen sample points over a disc, used to soften the background layer:
// nearer taps get more weight, so the blur stays soft rather than ringy.
const KERNEL_SIZE = 16;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tBackground;
  uniform sampler2D tForeground;
  uniform vec2 texel;
  uniform float aspect;
  uniform float cell;
  uniform float bgBlurPx;
  varying vec2 vUv;

  float bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2.0 + a.y * a.y * 0.75);
  }
  float bayer4(vec2 a) {
    return bayer2(0.5 * a) * 0.25 + bayer2(a);
  }

  vec3 blurredBackground(vec2 uv) {
    vec3 gathered = texture2D(tBackground, uv).rgb;
    float weight = 1.0;
    for (int i = 0; i < ${KERNEL_SIZE}; i++) {
      float t = float(i) / float(${KERNEL_SIZE});
      float angle = t * 6.2831853 * 2.4;
      float reach = sqrt(t);
      vec2 offset = vec2(cos(angle), sin(angle)) * reach * bgBlurPx * texel;
      gathered += texture2D(tBackground, uv + offset).rgb;
      weight += 1.0;
    }
    return gathered / weight;
  }

  void main() {
    // Wide-lens barrel distortion, zoomed so the corners still fill the frame.
    vec2 centered = vUv - 0.5;
    vec2 lensUv = centered * vec2(aspect, 1.0);
    float r2 = dot(lensUv, lensUv);
    vec2 sampleUv = 0.5 + centered * (1.0 + 0.06 * r2) * 0.94;

    // The hall is always a soft backdrop layer; the table scene, composited
    // over it by alpha, is never blurred — so nothing in reach of the
    // player's hands can ever come out fuzzy.
    // The hall is only ever a dim, cold, blurred suggestion of shapes and candle glow.
    vec3 background = blurredBackground(sampleUv) * vec3(0.5, 0.62, 0.5);
    vec4 foreground = texture2D(tForeground, sampleUv);
    vec3 color = mix(background, foreground.rgb, foreground.a);

    // Crush the blacks toward a cold green, and push the lit parts amber.
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 shadowTint = vec3(0.72, 1.0, 0.78);
    vec3 lightTint = vec3(1.22, 0.96, 0.66);
    color *= mix(shadowTint, lightTint, smoothstep(0.015, 0.3, luma));
    color = max(color - 0.002, 0.0);
    color = pow(color, vec3(1.06));
    color *= clamp(1.0 - r2 * 0.95, 0.0, 1.0);

    gl_FragColor = vec4(max(color, 0.0), 1.0);
    #include <colorspace_fragment>

    // fixed ordered dither, so it never shimmers
    const float levels = 7.0;
    gl_FragColor.rgb = floor(gl_FragColor.rgb * levels + bayer4(floor(gl_FragCoord.xy / cell))) / levels;
  }
`;

/**
 * Renders the room as one layer and the table scene as another, blurs only
 * the room, and composites the sharp table over it by alpha — so the hall
 * always reads as background without ever risking a blur on the table
 * itself. Then applies a wide-lens warp, a colour grade and a fixed dither.
 */
export class PixelPass {
  private readonly backgroundTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  private readonly foregroundTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  private readonly screen = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: {
      tBackground: { value: this.backgroundTarget.texture },
      tForeground: { value: this.foregroundTarget.texture },
      texel: { value: new THREE.Vector2(1, 1) },
      aspect: { value: 1 },
      cell: { value: 2 },
      bgBlurPx: { value: 3.0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const triangle = new THREE.Mesh(geometry, this.material);
    triangle.frustumCulled = false;
    this.screen.add(triangle);
  }

  setSize(width: number, height: number, cell: number): void {
    this.backgroundTarget.setSize(width, height);
    this.foregroundTarget.setSize(width, height);
    this.material.uniforms.cell.value = cell;
    this.material.uniforms.aspect.value = width / height;
    this.material.uniforms.texel.value.set(1 / width, 1 / height);
  }

  render(renderer: THREE.WebGLRenderer, background: THREE.Scene, foreground: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.backgroundTarget);
    renderer.render(background, camera);

    // A transparent clear, so gaps in the table scene (which has no
    // background of its own) stay alpha 0 and let the blurred hall show through.
    renderer.setRenderTarget(this.foregroundTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(foreground, camera);

    renderer.setRenderTarget(null);
    renderer.render(this.screen, this.camera);
  }

  dispose(): void {
    this.backgroundTarget.dispose();
    this.foregroundTarget.dispose();
    this.material.dispose();
  }
}
