// wind-gl.ts
// Drop-in replacement for the code you pasted.
// Key fixes:
// 1) Wind texture is encoded in MERCATOR-Y (matches WebMercator maps).
// 2) Shader distortion uses inverse-mercator-derived latitude (no more lat-linear assumption).
// 3) Particles no longer "wrap" with fract(); they respawn when out of bounds (no teleport).
// 4) Screen trail textures use LINEAR (smoother trails).
// 5) Draw pass uses the same bilinear wind lookup as update pass (consistent speed/color).

const VERT_QUAD = `
precision mediump float;
attribute vec2 a_pos;
varying vec2 v_tex_pos;
void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG_UPDATE = `
precision highp float;

uniform sampler2D u_particles;
uniform sampler2D u_wind;

uniform vec2  u_wind_res;
uniform vec2  u_wind_min;
uniform vec2  u_wind_max;

uniform float u_speed_factor;
uniform float u_rand_seed;
uniform float u_drop_rate;
uniform float u_drop_rate_bump;

uniform float u_merc_south;
uniform float u_merc_north;

varying vec2 v_tex_pos;

const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);

float rand(vec2 co) {
  float t = dot(rand_constants.xy, co);
  return fract(sin(t) * (rand_constants.z + t));
}

vec2 lookup_wind_bilinear(vec2 uv) {
  vec2 px = 1.0 / u_wind_res;
  vec2 st = uv * u_wind_res;
  vec2 ij = floor(st);
  vec2 f  = fract(st);

  vec2 vc = ij * px;

  vec2 tl = texture2D(u_wind, vc).rg;
  vec2 tr = texture2D(u_wind, vc + vec2(px.x, 0.0)).rg;
  vec2 bl = texture2D(u_wind, vc + vec2(0.0, px.y)).rg;
  vec2 br = texture2D(u_wind, vc + px).rg;

  vec2 top_mix = mix(tl, tr, f.x);
  vec2 bot_mix = mix(bl, br, f.x);
  return mix(top_mix, bot_mix, f.y);
}

float mercToLat(float m) {
  // lat = 2*atan(exp(m)) - pi/2
  return 2.0 * atan(exp(m)) - 1.57079632679;
}

void main() {
  vec4 color = texture2D(u_particles, v_tex_pos);

  // Decode pos in [0..1] from RGBA packing
  vec2 pos = vec2(
    color.r / 255.0 + color.b,
    color.g / 255.0 + color.a
  );

  // Wind sampling uses pos directly as UV in MERCATOR-normalized space
  vec2 velocity = mix(u_wind_min, u_wind_max, lookup_wind_bilinear(pos));
  float speed_t = length(velocity) / max(1e-6, length(u_wind_max));

  // MERCATOR-consistent latitude for distortion (x scale vs latitude)
  float m = mix(u_merc_north, u_merc_south, pos.y);
  float lat = mercToLat(m);
  float distortion = max(0.05, cos(lat)); // clamp to avoid blow-ups near poles

  // Move particle (scale tuned; keep your factor but make stable)
  vec2 offset = vec2(velocity.x / distortion, velocity.y) * u_speed_factor * 0.0003;
  vec2 nextPos = pos + offset;

  // If out-of-bounds, force respawn instead of fract-wrapping (prevents teleport trails)
  float oob =
    step(nextPos.x, 0.0) + step(1.0, nextPos.x) +
    step(nextPos.y, 0.0) + step(1.0, nextPos.y);
  float outOfBounds = clamp(oob, 0.0, 1.0);

  // Drop probability (higher in slow areas)
  vec2 seed = (v_tex_pos + pos) * (u_rand_seed + 1.0);
  float dropByRate = step(1.0 - u_drop_rate - speed_t * u_drop_rate_bump, rand(seed));
  float drop = max(dropByRate, outOfBounds);

  vec2 random_pos = vec2(rand(seed + 1.3), rand(seed + 2.1));
  pos = mix(nextPos, random_pos, drop);

  // Clamp back into [0..1] after update (for numerical safety)
  pos = clamp(pos, 0.0, 1.0);

  // Encode back to RGBA packing
  gl_FragColor = vec4(
    fract(pos * 255.0),
    floor(pos * 255.0) / 255.0
  );
}
`;

const VERT_DRAW = `
precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform float u_particles_res;

uniform vec2 u_offset;
uniform vec2 u_scale;

uniform sampler2D u_wind;
uniform vec2 u_wind_res;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;

varying float v_speed;

vec2 lookup_wind_bilinear(vec2 uv) {
  vec2 px = 1.0 / u_wind_res;
  vec2 st = uv * u_wind_res;
  vec2 ij = floor(st);
  vec2 f  = fract(st);

  vec2 vc = ij * px;

  vec2 tl = texture2D(u_wind, vc).rg;
  vec2 tr = texture2D(u_wind, vc + vec2(px.x, 0.0)).rg;
  vec2 bl = texture2D(u_wind, vc + vec2(0.0, px.y)).rg;
  vec2 br = texture2D(u_wind, vc + px).rg;

  vec2 top_mix = mix(tl, tr, f.x);
  vec2 bot_mix = mix(bl, br, f.x);
  return mix(top_mix, bot_mix, f.y);
}

void main() {
  vec2 uvParticles = vec2(
    fract(a_index / u_particles_res),
    floor(a_index / u_particles_res) / u_particles_res
  );

  vec4 color = texture2D(u_particles, uvParticles);
  vec2 pos = vec2(
    color.r / 255.0 + color.b,
    color.g / 255.0 + color.a
  );

  vec2 velocity = mix(u_wind_min, u_wind_max, lookup_wind_bilinear(pos));
  v_speed = length(velocity) / max(1e-6, length(u_wind_max));

  vec2 screen_pos = pos * u_scale + u_offset;
  float size = mix(1.0, 2.0, v_speed);
  gl_PointSize = size;
  gl_Position = vec4(screen_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG_DRAW = `
precision mediump float;
varying float v_speed;

void main() {
  vec3 c;
  float s = v_speed;
  if (s < 0.2) c = mix(vec3(0.7, 0.85, 1.0), vec3(0.4, 0.9, 1.0), s / 0.2);
  else if (s < 0.4) c = mix(vec3(0.4, 0.9, 1.0), vec3(0.2, 1.0, 0.6), (s - 0.2) / 0.2);
  else if (s < 0.6) c = mix(vec3(0.2, 1.0, 0.6), vec3(0.9, 1.0, 0.2), (s - 0.4) / 0.2);
  else if (s < 0.8) c = mix(vec3(0.9, 1.0, 0.2), vec3(1.0, 0.6, 0.1), (s - 0.6) / 0.2);
  else c = mix(vec3(1.0, 0.6, 0.1), vec3(1.0, 0.2, 0.2), (s - 0.8) / 0.2);
  gl_FragColor = vec4(c, 1.0);
}
`;

const VERT_SCREEN = `
precision mediump float;
attribute vec2 a_pos;
varying vec2 v_tex_pos;
void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG_SCREEN = `
precision mediump float;
uniform sampler2D u_screen;
uniform float u_opacity;
varying vec2 v_tex_pos;

void main() {
  vec4 color = texture2D(u_screen, vec2(v_tex_pos.x, 1.0 - v_tex_pos.y));
  float a = min(1.0, max(color.r, max(color.g, color.b)) * 1.5);
  gl_FragColor = vec4(color.rgb * u_opacity, a * u_opacity);
}
`;

const FRAG_FADE = `
precision mediump float;
uniform sampler2D u_screen;
uniform float u_fade;
varying vec2 v_tex_pos;

void main() {
  vec4 color = texture2D(u_screen, v_tex_pos);
  gl_FragColor = vec4(color.rgb * u_fade, 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
  }
  return program;
}

function createTexture(
  gl: WebGLRenderingContext,
  filter: number,
  data: ArrayBufferView | null,
  width: number,
  height: number
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  if (data) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  return texture;
}

function bindTexture(gl: WebGLRenderingContext, texture: WebGLTexture, unit: number) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

function bindFramebuffer(gl: WebGLRenderingContext, fb: WebGLFramebuffer | null, texture?: WebGLTexture) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  if (fb && texture) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  }
}

export interface WindData {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  width: number;
  height: number;
  pixels: Uint8Array;

  // NEW: the mercator bounds used to encode the texture
  mercSouth: number;
  mercNorth: number;

  // Original bbox (degrees)
  south: number;
  north: number;
  west: number;
  east: number;
}

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

function mercY(latDeg: number) {
  // y = ln(tan(pi/4 + lat/2))
  const lat = degToRad(latDeg);
  // clamp extreme lats to avoid infinity
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latDeg));
  const latC = degToRad(clamped);
  return Math.log(Math.tan(Math.PI / 4 + latC / 2));
}

function invMercY(m: number) {
  // lat = 2*atan(exp(m)) - pi/2
  return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * (180 / Math.PI);
}

export class WindGL {
  private gl: WebGLRenderingContext;

  private updateProgram: WebGLProgram;
  private drawProgram: WebGLProgram;
  private screenProgram: WebGLProgram;
  private fadeProgram: WebGLProgram;

  private quadBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private framebuffer: WebGLFramebuffer;

  private particleStateTextures: [WebGLTexture, WebGLTexture] = [null!, null!];
  private screenTextures: [WebGLTexture, WebGLTexture] = [null!, null!];
  private windTexture: WebGLTexture | null = null;

  private particleStateResolution = 0;
  private numParticles = 0;

  fadeOpacity = 0.993;
  speedFactor = 0.8;
  dropRate = 0.003;
  dropRateBump = 0.01;

  windData: WindData | null = null;

  // Viewport mapping: screenUV = pos * scale + offset
  private offset: [number, number] = [0, 0];
  private scale: [number, number] = [1, 1];

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;

    this.updateProgram = createProgram(gl, VERT_QUAD, FRAG_UPDATE);
    this.drawProgram = createProgram(gl, VERT_DRAW, FRAG_DRAW);
    this.screenProgram = createProgram(gl, VERT_SCREEN, FRAG_SCREEN);
    this.fadeProgram = createProgram(gl, VERT_QUAD, FRAG_FADE);

    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer()!;
    this.framebuffer = gl.createFramebuffer()!;

    this.setNumParticles(65536);
    this.resizeScreen();
  }

  resizeScreen() {
    const gl = this.gl;

    if (this.screenTextures[0]) gl.deleteTexture(this.screenTextures[0]);
    if (this.screenTextures[1]) gl.deleteTexture(this.screenTextures[1]);

    const w = gl.canvas.width;
    const h = gl.canvas.height;

    const emptyPixels = new Uint8Array(w * h * 4);

    // LINEAR makes trails smoother and less crunchy
    this.screenTextures[0] = createTexture(gl, gl.LINEAR, emptyPixels, w, h);
    this.screenTextures[1] = createTexture(gl, gl.LINEAR, emptyPixels, w, h);
  }

  setNumParticles(count: number) {
    const gl = this.gl;

    const res = Math.ceil(Math.sqrt(count));
    this.particleStateResolution = res;
    this.numParticles = res * res;

    const particleState = new Uint8Array(this.numParticles * 4);
    for (let i = 0; i < particleState.length; i++) particleState[i] = Math.floor(Math.random() * 256);

    this.particleStateTextures[0] = createTexture(gl, gl.NEAREST, particleState, res, res);
    this.particleStateTextures[1] = createTexture(gl, gl.NEAREST, particleState, res, res);

    const indices = new Float32Array(this.numParticles);
    for (let i = 0; i < this.numParticles; i++) indices[i] = i;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  }

  setWind(data: WindData) {
    const gl = this.gl;
    this.windData = data;

    if (this.windTexture) gl.deleteTexture(this.windTexture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    // LINEAR on wind texture is fine (we also do manual bilinear, but LINEAR helps when sampling between texels)
    this.windTexture = createTexture(gl, gl.LINEAR, data.pixels, data.width, data.height);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }

  // Leaflet / map integration should compute these two from the map transform.
  // screenUV = pos * scale + offset, where both are in [0..1] of screen.
  setViewport(offset: [number, number], scale: [number, number]) {
    this.offset = offset;
    this.scale = scale;
  }

  draw() {
    const gl = this.gl;
    if (!this.windTexture || !this.windData) return;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    bindTexture(gl, this.windTexture, 0);
    bindTexture(gl, this.particleStateTextures[0], 1);

    this.drawScreen();
    this.updateParticles();
  }

  private drawScreen() {
    const gl = this.gl;

    // Render into screenTextures[1]
    bindFramebuffer(gl, this.framebuffer, this.screenTextures[1]);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.disable(gl.BLEND);
    this.drawFade();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawParticles();
    gl.disable(gl.BLEND);

    // Present to canvas
    bindFramebuffer(gl, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.disable(gl.BLEND);

    const prog = this.screenProgram;
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    bindTexture(gl, this.screenTextures[1], 2);
    gl.uniform1i(gl.getUniformLocation(prog, "u_screen"), 2);
    gl.uniform1f(gl.getUniformLocation(prog, "u_opacity"), 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // swap
    const tmp = this.screenTextures[0];
    this.screenTextures[0] = this.screenTextures[1];
    this.screenTextures[1] = tmp;
  }

  private drawFade() {
    const gl = this.gl;
    const prog = this.fadeProgram;
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    bindTexture(gl, this.screenTextures[0], 2);
    gl.uniform1i(gl.getUniformLocation(prog, "u_screen"), 2);
    gl.uniform1f(gl.getUniformLocation(prog, "u_fade"), this.fadeOpacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawParticles() {
    const gl = this.gl;
    const prog = this.drawProgram;
    gl.useProgram(prog);

    const aIndex = gl.getAttribLocation(prog, "a_index");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
    gl.enableVertexAttribArray(aIndex);
    gl.vertexAttribPointer(aIndex, 1, gl.FLOAT, false, 0, 0);

    bindTexture(gl, this.particleStateTextures[0], 1);
    gl.uniform1i(gl.getUniformLocation(prog, "u_particles"), 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_particles_res"), this.particleStateResolution);

    bindTexture(gl, this.windTexture!, 0);
    gl.uniform1i(gl.getUniformLocation(prog, "u_wind"), 0);
    gl.uniform2f(gl.getUniformLocation(prog, "u_wind_res"), this.windData!.width, this.windData!.height);
    gl.uniform2f(gl.getUniformLocation(prog, "u_wind_min"), this.windData!.uMin, this.windData!.vMin);
    gl.uniform2f(gl.getUniformLocation(prog, "u_wind_max"), this.windData!.uMax, this.windData!.vMax);

    gl.uniform2f(gl.getUniformLocation(prog, "u_offset"), this.offset[0], this.offset[1]);
    gl.uniform2f(gl.getUniformLocation(prog, "u_scale"), this.scale[0], this.scale[1]);

    gl.drawArrays(gl.POINTS, 0, this.numParticles);
  }

  private updateParticles() {
    const gl = this.gl;

    bindFramebuffer(gl, this.framebuffer, this.particleStateTextures[1]);
    gl.viewport(0, 0, this.particleStateResolution, this.particleStateResolution);

    const prog = this.updateProgram;
    gl.useProgram(prog);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    bindTexture(gl, this.particleStateTextures[0], 1);
    gl.uniform1i(gl.getUniformLocation(prog, "u_particles"), 1);

    bindTexture(gl, this.windTexture!, 0);
    gl.uniform1i(gl.getUniformLocation(prog, "u_wind"), 0);

    gl.uniform2f(gl.getUniformLocation(prog, "u_wind_res"), this.windData!.width, this.windData!.height);
    gl.uniform2f(gl.getUniformLocation(prog, "u_wind_min"), this.windData!.uMin, this.windData!.vMin);
    gl.uniform2f(gl.getUniformLocation(prog, "u_wind_max"), this.windData!.uMax, this.windData!.vMax);

    gl.uniform1f(gl.getUniformLocation(prog, "u_speed_factor"), this.speedFactor);
    gl.uniform1f(gl.getUniformLocation(prog, "u_rand_seed"), Math.random());
    gl.uniform1f(gl.getUniformLocation(prog, "u_drop_rate"), this.dropRate);
    gl.uniform1f(gl.getUniformLocation(prog, "u_drop_rate_bump"), this.dropRateBump);

    // NEW: mercator bounds for inverse-mercator distortion calc
    gl.uniform1f(gl.getUniformLocation(prog, "u_merc_south"), this.windData!.mercSouth);
    gl.uniform1f(gl.getUniformLocation(prog, "u_merc_north"), this.windData!.mercNorth);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // swap
    const tmp = this.particleStateTextures[0];
    this.particleStateTextures[0] = this.particleStateTextures[1];
    this.particleStateTextures[1] = tmp;
  }

  destroy() {
    const gl = this.gl;

    gl.deleteProgram(this.updateProgram);
    gl.deleteProgram(this.drawProgram);
    gl.deleteProgram(this.screenProgram);
    gl.deleteProgram(this.fadeProgram);

    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteFramebuffer(this.framebuffer);

    if (this.windTexture) gl.deleteTexture(this.windTexture);

    for (const t of this.particleStateTextures) if (t) gl.deleteTexture(t);
    for (const t of this.screenTextures) if (t) gl.deleteTexture(t);
  }
}

/**
 * IMPORTANT:
 * Your input gridPoints are lat/lng in degrees and windSpeed/Dir.
 * We encode a wind texture whose Y axis is MERCATOR (not lat-linear).
 * That makes overlay + viewport affine mapping valid on WebMercator maps.
 */
export function encodeWindToTexture(
  gridPoints: { lat: number; lng: number; windSpeed: number; windDir: number }[],
  south: number,
  north: number,
  west: number,
  east: number,
  texWidth = 64,
  texHeight = 32
): WindData {
  const uArr: number[] = [];
  const vArr: number[] = [];

  for (const pt of gridPoints) {
    const rad = degToRad(pt.windDir);
    const knots = pt.windSpeed * 0.5399; // keep your conversion
    uArr.push(-Math.sin(rad) * knots);
    vArr.push(-Math.cos(rad) * knots);
  }

  let uMin = Infinity,
    uMax = -Infinity,
    vMin = Infinity,
    vMax = -Infinity;

  for (let i = 0; i < uArr.length; i++) {
    if (uArr[i] < uMin) uMin = uArr[i];
    if (uArr[i] > uMax) uMax = uArr[i];
    if (vArr[i] < vMin) vMin = vArr[i];
    if (vArr[i] > vMax) vMax = vArr[i];
  }

  if (uMin === uMax) {
    uMin -= 1;
    uMax += 1;
  }
  if (vMin === vMax) {
    vMin -= 1;
    vMax += 1;
  }

  const pixels = new Uint8Array(texWidth * texHeight * 4);

  // Mercator bounds for the encoding
  const mercNorth = mercY(north);
  const mercSouth = mercY(south);

  for (let ty = 0; ty < texHeight; ty++) {
    const tY = texHeight <= 1 ? 0 : ty / (texHeight - 1);

    // y runs top->bottom; interpolate mercator value then invert to lat for sampling
    const m = mercNorth + (mercSouth - mercNorth) * tY;
    const lat = invMercY(m);

    for (let tx = 0; tx < texWidth; tx++) {
      const tX = texWidth <= 1 ? 0 : tx / (texWidth - 1);
      const lon = west + tX * (east - west);

      // Simple inverse-distance weighting in lat/lon space (your original approach)
      // This is "ok" for small regions; if you later want global you’ll want a proper grid + bilinear.
      let totalW = 0;
      let uInterp = 0;
      let vInterp = 0;

      for (let i = 0; i < gridPoints.length; i++) {
        const dlat = lat - gridPoints[i].lat;
        const dlng = lon - gridPoints[i].lng;
        const d2 = dlat * dlat + dlng * dlng;

        if (d2 < 0.01) {
          uInterp = uArr[i];
          vInterp = vArr[i];
          totalW = 1;
          break;
        }

        const w = 1 / d2;
        totalW += w;
        uInterp += uArr[i] * w;
        vInterp += vArr[i] * w;
      }

      if (totalW > 0) {
        uInterp /= totalW;
        vInterp /= totalW;
      }

      const uNorm = (uInterp - uMin) / (uMax - uMin);
      const vNorm = (vInterp - vMin) / (vMax - vMin);

      const idx = (ty * texWidth + tx) * 4;
      pixels[idx] = Math.round(Math.max(0, Math.min(1, uNorm)) * 255);
      pixels[idx + 1] = Math.round(Math.max(0, Math.min(1, vNorm)) * 255);
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 255;
    }
  }

  return {
    uMin,
    uMax,
    vMin,
    vMax,
    width: texWidth,
    height: texHeight,
    pixels,
    mercSouth,
    mercNorth,
    south,
    north,
    west,
    east,
  };
}