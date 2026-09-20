import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float aspect;
  uniform float cell;
  varying vec2 vUv;

  float bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2.0 + a.y * a.y * 0.75);
  }
  float bayer4(vec2 a) {
    return bayer2(0.5 * a) * 0.25 + bayer2(a);
  }

  void main() {
    // Wide-lens barrel distortion, zoomed so the corners still fill the frame.
    vec2 centered = vUv - 0.5;
    vec2 lensUv = centered * vec2(aspect, 1.0);
    float r2 = dot(lensUv, lensUv);
    vec2 sampleUv = 0.5 + centered * (1.0 + 0.06 * r2) * 0.94;
    vec3 color = texture2D(tDiffuse, sampleUv).rgb;

    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color * vec3(1.06, 0.97, 0.93), color * vec3(1.04, 1.0, 0.94), smoothstep(0.0, 0.35, luma));
    color = pow(color, vec3(0.8));
    color *= clamp(1.0 - r2 * 0.7, 0.0, 1.0);

    gl_FragColor = vec4(max(color, 0.0), 1.0);
    #include <colorspace_fragment>

    // fixed ordered dither, so it never shimmers
    const float levels = 10.0;
    gl_FragColor.rgb = floor(gl_FragColor.rgb * levels + bayer4(floor(gl_FragCoord.xy / cell))) / levels;
  }
`;

/** Renders the scene to a buffer, then warps, grades and dithers it onto the canvas. */
export class PixelPass {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  private readonly screen = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: this.target.texture },
      aspect: { value: 1 },
      cell: { value: 2 },
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
    this.target.setSize(width, height);
    this.material.uniforms.cell.value = cell;
    this.material.uniforms.aspect.value = width / height;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.screen, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
