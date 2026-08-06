/* ============================================================================
   gfx.js — a tiny WebGPU renderer for BitLife Online, with a WebGL2 fallback.

   Everything in the world is a box. One geometry, one pipeline, two instance
   buffers (static city / dynamic actors). That keeps the whole renderer small
   enough to read in one sitting and fast enough for thousands of boxes.

   Instance layout — 12 floats (48 bytes):
     0..2   position  (x, y, z)   box sits ON this point (base-anchored)
     3      flat flag (>0.5 = unlit, used for shadow blobs & signs)
     4..6   scale     (x, y, z)   full size in world units
     7      rotation about Y (radians)
     8..10  colour    (r, g, b)   0..1
     11     emissive  (0..1)      lit windows, neon, etc.
============================================================================ */

export const FLOATS_PER_INSTANCE = 12;

/* ------------------------------- mat4 ------------------------------------ */
/* Column-major Float32Array(16) — same memory layout WGSL and GLSL expect. */
export const mat4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },

  perspective(out, fovy, aspect, near, far, zeroToOne) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[11] = -1;
    if (zeroToOne) {                    // WebGPU / D3D depth range [0, 1]
      out[10] = far / (near - far);
      out[14] = (far * near) / (near - far);
    } else {                            // OpenGL depth range [-1, 1]
      out[10] = (far + near) / (near - far);
      out[14] = (2 * far * near) / (near - far);
    }
    return out;
  },

  lookAt(out, eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  },
};

/* --------------------------- cube geometry -------------------------------
   Base-anchored unit cube: x,z span [-0.5, 0.5], y spans [0, 1]. Placing a
   building then means "position = ground point, scale.y = height".         */
const CUBE = (() => {
  const out = [];
  const faces = [
    [[0, 0, 1],  [[-.5, 0, .5], [.5, 0, .5], [.5, 1, .5], [-.5, 1, .5]]],
    [[0, 0, -1], [[.5, 0, -.5], [-.5, 0, -.5], [-.5, 1, -.5], [.5, 1, -.5]]],
    [[1, 0, 0],  [[.5, 0, .5], [.5, 0, -.5], [.5, 1, -.5], [.5, 1, .5]]],
    [[-1, 0, 0], [[-.5, 0, -.5], [-.5, 0, .5], [-.5, 1, .5], [-.5, 1, -.5]]],
    [[0, 1, 0],  [[-.5, 1, .5], [.5, 1, .5], [.5, 1, -.5], [-.5, 1, -.5]]],
    [[0, -1, 0], [[-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5], [-.5, 0, .5]]],
  ];
  for (const [n, c] of faces) {
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(c[i][0], c[i][1], c[i][2], n[0], n[1], n[2]);
  }
  return new Float32Array(out);
})();

/* --------------------------------- WGSL ---------------------------------- */
const WGSL = /* wgsl */`
struct U {
  viewProj : mat4x4<f32>,
  sun      : vec4<f32>,   // xyz = direction toward the sun, w = intensity
  fog      : vec4<f32>,   // rgb = fog/sky colour, w = fog density
  cam      : vec4<f32>,   // xyz = camera position
  sky      : vec4<f32>,   // rgb = ambient sky bounce
};
@group(0) @binding(0) var<uniform> u : U;

struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) colour : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) world  : vec3<f32>,
  @location(3) mods   : vec2<f32>,   // x = flat flag, y = emissive
};

@vertex
fn vs(@location(0) p : vec3<f32>,
      @location(1) n : vec3<f32>,
      @location(2) ipos : vec4<f32>,
      @location(3) iscl : vec4<f32>,
      @location(4) icol : vec4<f32>) -> VOut {
  let s = sin(iscl.w);
  let c = cos(iscl.w);
  let lp = p * iscl.xyz;
  let wp = vec3<f32>(lp.x * c + lp.z * s, lp.y, -lp.x * s + lp.z * c) + ipos.xyz;
  let ln = normalize(n / max(iscl.xyz, vec3<f32>(0.0001)));
  let wn = vec3<f32>(ln.x * c + ln.z * s, ln.y, -ln.x * s + ln.z * c);

  var o : VOut;
  o.clip   = u.viewProj * vec4<f32>(wp, 1.0);
  o.colour = icol.rgb;
  o.normal = wn;
  o.world  = wp;
  o.mods   = vec2<f32>(ipos.w, icol.a);
  return o;
}

@fragment
fn fs(i : VOut) -> @location(0) vec4<f32> {
  var lit : vec3<f32>;
  if (i.mods.x > 0.5) {
    lit = i.colour;                                   // unlit: shadows, signage
  } else {
    let n    = normalize(i.normal);
    let ndl  = max(dot(n, normalize(u.sun.xyz)), 0.0);
    let hemi = 0.5 + 0.5 * n.y;                       // cheap sky/ground bounce
    lit = i.colour * (0.30 + u.sun.w * ndl) + u.sky.rgb * hemi * 0.25 * i.colour;
    lit = lit + i.colour * i.mods.y * 1.6;            // emissive
  }
  let d = length(i.world - u.cam.xyz);
  let f = 1.0 - exp(-pow(max(d - 25.0, 0.0) * u.fog.w, 2.0));
  return vec4<f32>(mix(lit, u.fog.rgb, clamp(f, 0.0, 1.0)), 1.0);
}
`;

/* --------------------------------- GLSL ---------------------------------- */
const GLSL_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 iPos;
layout(location=3) in vec4 iScl;
layout(location=4) in vec4 iCol;
uniform mat4 uViewProj;
out vec3 vColour; out vec3 vNormal; out vec3 vWorld; out vec2 vMods;
void main() {
  float s = sin(iScl.w), c = cos(iScl.w);
  vec3 lp = aPos * iScl.xyz;
  vec3 wp = vec3(lp.x * c + lp.z * s, lp.y, -lp.x * s + lp.z * c) + iPos.xyz;
  vec3 ln = normalize(aNor / max(iScl.xyz, vec3(0.0001)));
  vNormal = vec3(ln.x * c + ln.z * s, ln.y, -ln.x * s + ln.z * c);
  vColour = iCol.rgb; vWorld = wp; vMods = vec2(iPos.w, iCol.a);
  gl_Position = uViewProj * vec4(wp, 1.0);
}`;

const GLSL_FS = `#version 300 es
precision highp float;
in vec3 vColour; in vec3 vNormal; in vec3 vWorld; in vec2 vMods;
uniform vec4 uSun; uniform vec4 uFog; uniform vec4 uCam; uniform vec4 uSky;
out vec4 outColour;
void main() {
  vec3 lit;
  if (vMods.x > 0.5) {
    lit = vColour;
  } else {
    vec3 n = normalize(vNormal);
    float ndl = max(dot(n, normalize(uSun.xyz)), 0.0);
    float hemi = 0.5 + 0.5 * n.y;
    lit = vColour * (0.30 + uSun.w * ndl) + uSky.rgb * hemi * 0.25 * vColour;
    lit += vColour * vMods.y * 1.6;
  }
  float d = length(vWorld - uCam.xyz);
  float f = 1.0 - exp(-pow(max(d - 25.0, 0.0) * uFog.w, 2.0));
  outColour = vec4(mix(lit, uFog.rgb, clamp(f, 0.0, 1.0)), 1.0);
}`;

/* ========================================================================== */

/**
 * Create a renderer on `canvas`. Tries WebGPU, silently falls back to WebGL2.
 * Throws only if neither is available.
 */
export async function createGFX(canvas) {
  const gpu = await tryWebGPU(canvas).catch(() => null);
  if (gpu) return gpu;
  const gl = tryWebGL2(canvas);
  if (gl) return gl;
  throw new Error('This browser has neither WebGPU nor WebGL2.');
}

/* --------------------------------- shared -------------------------------- */
function baseRenderer(canvas) {
  return {
    canvas,
    viewProj: mat4.create(),
    _proj: mat4.create(),
    _view: mat4.create(),
    sun: [0.45, 0.82, 0.35, 0.85],
    fog: [0.62, 0.76, 0.92, 0.011],
    sky: [0.55, 0.72, 0.95, 1],
    camPos: [0, 0, 0],
    width: 1, height: 1, dpr: 1,

    /** Build the camera matrix. Call once per frame before render(). */
    setCamera(eye, target, fovDeg = 55, near = 0.3, far = 400) {
      mat4.perspective(this._proj, fovDeg * Math.PI / 180, this.width / this.height,
                       near, far, this.zeroToOne);
      mat4.lookAt(this._view, eye, target, [0, 1, 0]);
      mat4.multiply(this.viewProj, this._proj, this._view);
      this.camPos = eye;
    },

    /** World point -> {x, y, visible} in CSS pixels, for HTML overlay labels. */
    project(x, y, z) {
      const m = this.viewProj;
      const cx = m[0] * x + m[4] * y + m[8]  * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9]  * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0.01) return { x: 0, y: 0, visible: false };
      return {
        x: (cx / cw * 0.5 + 0.5) * (this.width / this.dpr),
        y: (0.5 - cy / cw * 0.5) * (this.height / this.dpr),
        visible: true,
      };
    },
  };
}

/* -------------------------------- WebGPU --------------------------------- */
async function tryWebGPU(canvas) {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  if (!ctx) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const SAMPLES = 4;
  const r = baseRenderer(canvas);
  r.api = 'webgpu';
  r.zeroToOne = true;

  const cubeBuf = device.createBuffer({
    size: CUBE.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cubeBuf, 0, CUBE);

  const uniformBuf = device.createBuffer({
    size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformData = new Float32Array(32);

  const module = device.createShaderModule({ code: WGSL });
  const instAttr = (loc, off) => ({ shaderLocation: loc, offset: off, format: 'float32x4' });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module, entryPoint: 'vs',
      buffers: [
        { arrayStride: 24, stepMode: 'vertex', attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ] },
        { arrayStride: FLOATS_PER_INSTANCE * 4, stepMode: 'instance',
          attributes: [instAttr(2, 0), instAttr(3, 16), instAttr(4, 32)] },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    // Every mesh here is a closed box, so depth testing already resolves
    // front vs back faces. Skipping the cull costs a little fill rate and
    // removes any chance of a winding-convention mismatch hiding the city.
    primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    multisample: { count: SAMPLES },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
  });

  let depthTex = null, msaaTex = null;
  const batches = { static: null, dynamic: null };

  function upload(key, floats, count) {
    let b = batches[key];
    if (!b || b.capacity < count) {
      if (b) b.buf.destroy();
      // Generous headroom: the dynamic count changes every frame as actors
      // are culled, and reallocating a GPU buffer per frame would be silly.
      const capacity = Math.max(256, Math.ceil(count * 1.6));
      b = batches[key] = {
        capacity, count: 0,
        buf: device.createBuffer({
          size: capacity * FLOATS_PER_INSTANCE * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        }),
      };
    }
    if (count > 0) {
      device.queue.writeBuffer(b.buf, 0, floats.buffer, floats.byteOffset,
                               count * FLOATS_PER_INSTANCE * 4);
    }
    b.count = count;
  }

  r.setStatic  = (floats, count) => upload('static', floats, count);
  r.setDynamic = (floats, count) => upload('dynamic', floats, count);

  r.resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w === r.width && h === r.height && depthTex) return;
    canvas.width = w; canvas.height = h;
    r.width = w; r.height = h; r.dpr = dpr;
    if (depthTex) depthTex.destroy();
    if (msaaTex) msaaTex.destroy();
    depthTex = device.createTexture({
      size: [w, h], format: 'depth24plus', sampleCount: SAMPLES,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    msaaTex = device.createTexture({
      size: [w, h], format, sampleCount: SAMPLES,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  };

  r.render = () => {
    if (!depthTex) r.resize();
    uniformData.set(r.viewProj, 0);
    uniformData.set(r.sun, 16);
    uniformData.set(r.fog, 20);
    uniformData.set([r.camPos[0], r.camPos[1], r.camPos[2], 0], 24);
    uniformData.set(r.sky, 28);
    device.queue.writeBuffer(uniformBuf, 0, uniformData);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: msaaTex.createView(),
        resolveTarget: ctx.getCurrentTexture().createView(),
        clearValue: { r: r.fog[0], g: r.fog[1], b: r.fog[2], a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTex.createView(), depthClearValue: 1,
        depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, cubeBuf);
    for (const key of ['static', 'dynamic']) {
      const b = batches[key];
      if (!b || b.count === 0) continue;
      pass.setVertexBuffer(1, b.buf);
      pass.draw(36, b.count);
    }
    pass.end();
    device.queue.submit([enc.finish()]);
  };

  r.resize();
  return r;
}

/* -------------------------------- WebGL2 --------------------------------- */
function tryWebGL2(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) return null;

  const r = baseRenderer(canvas);
  r.api = 'webgl2';
  r.zeroToOne = false;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, GLSL_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, GLSL_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const U = {
    viewProj: gl.getUniformLocation(prog, 'uViewProj'),
    sun: gl.getUniformLocation(prog, 'uSun'),
    fog: gl.getUniformLocation(prog, 'uFog'),
    cam: gl.getUniformLocation(prog, 'uCam'),
    sky: gl.getUniformLocation(prog, 'uSky'),
  };

  const cubeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, CUBE, gl.STATIC_DRAW);

  const batches = {};
  function makeVAO(key) {
    const vao = gl.createVertexArray();
    const ibuf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
    const stride = FLOATS_PER_INSTANCE * 4;
    for (let i = 0; i < 3; i++) {
      const loc = 2 + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return (batches[key] = { vao, ibuf, count: 0, capacity: 0 });
  }

  function upload(key, floats, count) {
    const b = batches[key] || makeVAO(key);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.ibuf);
    const needed = count * FLOATS_PER_INSTANCE;
    if (b.capacity < needed) {
      b.capacity = Math.max(needed, 1024);
      gl.bufferData(gl.ARRAY_BUFFER, b.capacity * 4, gl.DYNAMIC_DRAW);
    }
    if (count > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, floats, 0, needed);
    b.count = count;
  }

  r.setStatic  = (floats, count) => upload('static', floats, count);
  r.setDynamic = (floats, count) => upload('dynamic', floats, count);

  r.resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w === r.width && h === r.height) return;
    canvas.width = w; canvas.height = h;
    r.width = w; r.height = h; r.dpr = dpr;
  };

  r.render = () => {
    gl.viewport(0, 0, r.width, r.height);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);   // see the WebGPU pipeline for why
    gl.clearColor(r.fog[0], r.fog[1], r.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.viewProj, false, r.viewProj);
    gl.uniform4fv(U.sun, r.sun);
    gl.uniform4fv(U.fog, r.fog);
    gl.uniform4f(U.cam, r.camPos[0], r.camPos[1], r.camPos[2], 0);
    gl.uniform4fv(U.sky, r.sky);
    for (const key of ['static', 'dynamic']) {
      const b = batches[key];
      if (!b || b.count === 0) continue;
      gl.bindVertexArray(b.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, b.count);
    }
    gl.bindVertexArray(null);
  };

  r.resize();
  return r;
}

/* ---------------------------- instance writer ----------------------------
   A growable Float32Array with a cursor. Game code just calls box(...).     */
export class InstanceList {
  constructor(capacity = 1024) {
    this.data = new Float32Array(capacity * FLOATS_PER_INSTANCE);
    this.count = 0;
  }
  reset() { this.count = 0; }
  box(x, y, z, sx, sy, sz, colour, rot = 0, emissive = 0, flat = 0) {
    const need = (this.count + 1) * FLOATS_PER_INSTANCE;
    if (need > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    const o = this.count * FLOATS_PER_INSTANCE;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = flat;
    d[o + 4] = sx; d[o + 5] = sy; d[o + 6] = sz; d[o + 7] = rot;
    d[o + 8] = colour[0]; d[o + 9] = colour[1]; d[o + 10] = colour[2]; d[o + 11] = emissive;
    this.count++;
  }
  /** Flat dark quad on the ground — cheap contact shadow. */
  shadow(x, z, radius, strength = 0.55) {
    const v = 0.16 * (1 - strength) + 0.05;
    this.box(x, 0.03, z, radius * 2, 0.012, radius * 2, [v, v, v * 1.15], 0, 0, 1);
  }
}

/** #rrggbb (or 0xrrggbb) -> [r, g, b] in 0..1, with optional brightness scale. */
export function rgb(hex, scale = 1) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  return [((n >> 16) & 255) / 255 * scale, ((n >> 8) & 255) / 255 * scale, (n & 255) / 255 * scale];
}
