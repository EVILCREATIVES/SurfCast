const VERT_QUAD = `
  precision mediump float;
  attribute vec2 a_pos;
  varying vec2 v_tex_pos;
  void main() {
    v_tex_pos = a_pos;
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0, 1);
  }
`;

const FRAG_UPDATE = `
  precision highp float;
  uniform sampler2D u_particles;
  uniform sampler2D u_wind;
  uniform vec2 u_wind_res;
  uniform vec2 u_wind_min;
  uniform vec2 u_wind_max;
  uniform float u_speed_factor;
  uniform float u_rand_seed;
  uniform float u_drop_rate;
  uniform float u_drop_rate_bump;
  uniform vec4 u_bbox;
  varying vec2 v_tex_pos;

  const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
  float rand(vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
  }

  vec2 lookup_wind(vec2 uv) {
    vec2 px = 1.0 / u_wind_res;
    vec2 vc = (floor(uv * u_wind_res)) * px;
    vec2 f = fract(uv * u_wind_res);
    vec2 tl = texture2D(u_wind, vc).rg;
    vec2 tr = texture2D(u_wind, vc + vec2(px.x, 0)).rg;
    vec2 bl = texture2D(u_wind, vc + vec2(0, px.y)).rg;
    vec2 br = texture2D(u_wind, vc + px).rg;
    vec2 top_mix = mix(tl, tr, f.x);
    vec2 bot_mix = mix(bl, br, f.x);
    return mix(top_mix, bot_mix, f.y);
  }

  void main() {
    vec4 color = texture2D(u_particles, v_tex_pos);
    vec2 pos = vec2(
      color.r / 255.0 + color.b,
      color.g / 255.0 + color.a
    );

    vec2 uv = pos;
    vec2 velocity = mix(u_wind_min, u_wind_max, lookup_wind(uv));
    float speed_t = length(velocity) / length(u_wind_max);

    float distortion = cos(radians(mix(u_bbox.y, u_bbox.w, pos.y) * 180.0 - 90.0));
    vec2 offset = vec2(velocity.x / distortion, velocity.y) * u_speed_factor * 0.0001;
    pos = fract(pos + offset + 1.0);

    vec2 seed = (v_tex_pos + pos) * u_rand_seed;
    float drop = step(1.0 - u_drop_rate - speed_t * u_drop_rate_bump, rand(seed));
    vec2 random_pos = vec2(rand(seed + 1.3), rand(seed + 2.1));
    pos = mix(pos, random_pos, drop);

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
  varying float v_speed;
  uniform sampler2D u_wind;
  uniform vec2 u_wind_min;
  uniform vec2 u_wind_max;

  void main() {
    vec4 color = texture2D(u_particles, vec2(
      fract(a_index / u_particles_res),
      floor(a_index / u_particles_res) / u_particles_res
    ));
    vec2 pos = vec2(
      color.r / 255.0 + color.b,
      color.g / 255.0 + color.a
    );

    vec2 velocity = mix(u_wind_min, u_wind_max, texture2D(u_wind, pos).rg);
    v_speed = length(velocity) / length(u_wind_max);

    vec2 screen_pos = pos * u_scale + u_offset;
    gl_PointSize = 1.0;
    gl_Position = vec4(screen_pos * 2.0 - 1.0, 0, 1);
  }
`;

const FRAG_DRAW = `
  precision mediump float;
  varying float v_speed;
  void main() {
    vec3 c;
    float s = v_speed;
    if (s < 0.15) c = mix(vec3(0.31, 0.71, 1.0), vec3(0.24, 0.82, 0.67), s / 0.15);
    else if (s < 0.3) c = mix(vec3(0.24, 0.82, 0.67), vec3(0.39, 0.9, 0.31), (s - 0.15) / 0.15);
    else if (s < 0.5) c = mix(vec3(0.39, 0.9, 0.31), vec3(0.78, 0.9, 0.2), (s - 0.3) / 0.2);
    else if (s < 0.7) c = mix(vec3(0.78, 0.9, 0.2), vec3(1.0, 0.75, 0.12), (s - 0.5) / 0.2);
    else if (s < 0.85) c = mix(vec3(1.0, 0.75, 0.12), vec3(1.0, 0.43, 0.12), (s - 0.7) / 0.15);
    else c = mix(vec3(1.0, 0.43, 0.12), vec3(1.0, 0.2, 0.2), (s - 0.85) / 0.15);
    gl_FragColor = vec4(c, 0.85);
  }
`;

const VERT_SCREEN = `
  precision mediump float;
  attribute vec2 a_pos;
  varying vec2 v_tex_pos;
  void main() {
    v_tex_pos = a_pos;
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0, 1);
  }
`;

const FRAG_SCREEN = `
  precision mediump float;
  uniform sampler2D u_screen;
  uniform float u_opacity;
  varying vec2 v_tex_pos;
  void main() {
    vec4 color = texture2D(u_screen, vec2(v_tex_pos.x, 1.0 - v_tex_pos.y));
    gl_FragColor = vec4(color.rgb, color.a * u_opacity);
  }
`;

const FRAG_FADE = `
  precision mediump float;
  uniform sampler2D u_screen;
  uniform float u_fade;
  varying vec2 v_tex_pos;
  void main() {
    vec4 color = texture2D(u_screen, v_tex_pos);
    gl_FragColor = vec4(floor(color.rgb * u_fade * 255.0) / 255.0, color.a * u_fade);
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

function createTexture(gl: WebGLRenderingContext, filter: number, data: ArrayBufferView | null, width: number, height: number): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  if (data) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
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

interface WindData {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  width: number;
  height: number;
  pixels: Uint8Array;
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

  private particleStateResolution: number = 0;
  private numParticles: number = 0;

  fadeOpacity = 0.996;
  speedFactor = 0.15;
  dropRate = 0.003;
  dropRateBump = 0.01;

  windData: WindData | null = null;

  private bbox = { south: -90, north: 90, west: -180, east: 180 };
  private offset = [0, 0];
  private scale = [1, 1];

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
    this.screenTextures[0] = createTexture(gl, gl.NEAREST, emptyPixels, w, h);
    this.screenTextures[1] = createTexture(gl, gl.NEAREST, emptyPixels, w, h);
  }

  setNumParticles(count: number) {
    const gl = this.gl;
    const res = Math.ceil(Math.sqrt(count));
    this.particleStateResolution = res;
    this.numParticles = res * res;

    const particleState = new Uint8Array(this.numParticles * 4);
    for (let i = 0; i < particleState.length; i++) {
      particleState[i] = Math.floor(Math.random() * 256);
    }
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
    this.windTexture = createTexture(gl, gl.LINEAR, data.pixels, data.width, data.height);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }

  setBBox(south: number, north: number, west: number, east: number) {
    this.bbox = { south, north, west, east };
  }

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

    // Step 1: Render faded previous frame + new particles into screenTextures[1]
    bindFramebuffer(gl, this.framebuffer, this.screenTextures[1]);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Fade pass overwrites the target entirely (no blending needed - full-screen quad)
    gl.disable(gl.BLEND);
    this.drawFade();

    // Particles blend on top of the faded content
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawParticles();
    gl.disable(gl.BLEND);

    // Step 2: Draw the composited screen texture to the actual canvas
    bindFramebuffer(gl, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
    gl.disable(gl.BLEND);

    // Swap screen textures for next frame
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
    gl.uniform4f(gl.getUniformLocation(prog, "u_bbox"),
      this.bbox.west / 360 + 0.5,
      this.bbox.south / 180 + 0.5,
      this.bbox.east / 360 + 0.5,
      this.bbox.north / 180 + 0.5
    );

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const tmp = this.particleStateTextures[0];
    this.particleStateTextures[0] = this.particleStateTextures[1];
    this.particleStateTextures[1] = tmp;
  }

  clearScreen() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;
    const emptyPixels = new Uint8Array(w * h * 4);
    bindTexture(gl, this.screenTextures[0], 2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyPixels);
    bindTexture(gl, this.screenTextures[1], 2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyPixels);
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

export function encodeWindToTexture(
  gridPoints: { lat: number; lng: number; windSpeed: number; windDir: number }[],
  south: number, north: number, west: number, east: number,
  texWidth = 64, texHeight = 32
): WindData {
  const uArr: number[] = [];
  const vArr: number[] = [];

  for (const pt of gridPoints) {
    const rad = (pt.windDir * Math.PI) / 180;
    const knots = pt.windSpeed * 0.5399;
    uArr.push(-Math.sin(rad) * knots);
    vArr.push(-Math.cos(rad) * knots);
  }

  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < uArr.length; i++) {
    if (uArr[i] < uMin) uMin = uArr[i];
    if (uArr[i] > uMax) uMax = uArr[i];
    if (vArr[i] < vMin) vMin = vArr[i];
    if (vArr[i] > vMax) vMax = vArr[i];
  }
  if (uMin === uMax) { uMin -= 1; uMax += 1; }
  if (vMin === vMax) { vMin -= 1; vMax += 1; }

  const pixels = new Uint8Array(texWidth * texHeight * 4);

  for (let ty = 0; ty < texHeight; ty++) {
    for (let tx = 0; tx < texWidth; tx++) {
      const lon = west + (tx / (texWidth - 1)) * (east - west);
      const lat = north - (ty / (texHeight - 1)) * (north - south);

      let totalW = 0, uInterp = 0, vInterp = 0;
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
      pixels[idx] = Math.round(uNorm * 255);
      pixels[idx + 1] = Math.round(vNorm * 255);
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 255;
    }
  }

  return { uMin, uMax, vMin, vMax, width: texWidth, height: texHeight, pixels };
}
