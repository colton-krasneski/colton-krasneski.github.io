/* ============================================================
   The renderer, the air, and the last pass before a screen.

   Everything in the scene is linear HDR light; exposure, tone
   mapping and the grade all happen once, at the very end.
   ============================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { PARAMS } from "./settings.js";
import { clamp, clamp01, lerp } from "./terrain.js";

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: "high-performance", stencil: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;   // the grade pass tone maps, once, at the end
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color("#cfe6f7"), 20, 190);   // only a switch: the air is ours
const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 2600);

/* Shared uniform objects. Because every material is handed these exact
   objects, changing one here changes it everywhere, in one place. */
const SH = {
  uTime:   { value: 0 },
  uSkyLUT: { value: null },
  uNoise:  { value: null },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  /* x: how near the air stays clear, y: the distance that reads as thick,
     z: how sharply it closes in, w: the height ground mist thins out above */
  uAir:    { value: new THREE.Vector4(14, 165, 2.3, 8) },
};
/* ============================================================
   The air.

   Instead of one flat fog colour, every material looks up the sky
   in the direction it is being viewed from, so distant hills take
   the colour of the sky behind them and the haze glows around the
   sun. It is one texture fetch, shared by every shader.
   ============================================================ */

/* The world position every shader needs - for the haze, and for anything
   that wants to know which way it is being looked at. */
const FOG_PARS_V = "varying vec3 vAirW;";

const FOG_V = [
  "#ifdef USE_INSTANCING",
  "  vAirW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;",
  "#else",
  "  vAirW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
  "#endif",
].join("\n");

const FOG_PARS_F = [
  "varying vec3 vAirW;",
  "uniform sampler2D uSkyLUT;",
  "uniform vec3 uSunDir;",
  "uniform vec3 uSunCol;",
  "uniform vec4 uAir;",
].join("\n");

/* sky lookup shared by the fog, the sky dome and the water */
const SKY_LOOKUP = [
  "vec3 skyLook( vec3 d, sampler2D lut, vec3 sunDir ) {",
  "  float ang = acos( clamp( dot( d, sunDir ), -1.0, 1.0 ) ) * 0.31830989;",
  "  return texture2D( lut, vec2( ang, clamp( d.y * 0.5 + 0.5, 0.004, 0.996 ) ) ).rgb;",
  "}",
].join("\n");

const FOG_F = [
  "#ifdef USE_FOG",
  "{",
  "  vec3 fd = vAirW - cameraPosition;",
  "  float fdist = length( fd );",
  "  fd /= max( fdist, 0.0001 );",
  "  vec3 air = skyLook( fd, uSkyLUT, uSunDir );",
  "  float hz = exp( -max( vAirW.y - uAir.w, 0.0 ) * 0.014 ) * 0.72 + 0.28;",
  "  float t = max( fdist - uAir.x, 0.0 ) / uAir.y;",
  "  float f = 1.0 - exp( -pow( t, uAir.z ) * hz );",
  "  gl_FragColor.rgb = mix( gl_FragColor.rgb, air, clamp( f, 0.0, 1.0 ) );",
  "}",
  "#endif",
].join("\n");

/* Give a stock material our air, our clock and our sun. `hook` gets the
   shader afterwards for anything the material wants on top. */
function dress(mat, key, hook) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SH.uTime;
    sh.uniforms.uSkyLUT = SH.uSkyLUT;
    sh.uniforms.uNoise = SH.uNoise;
    sh.uniforms.uSunDir = SH.uSunDir;
    sh.uniforms.uSunCol = SH.uSunCol;
    sh.uniforms.uAir = SH.uAir;
    sh.vertexShader = sh.vertexShader
      .replace("#include <fog_pars_vertex>", FOG_PARS_V)
      .replace("#include <fog_vertex>", FOG_V);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <fog_pars_fragment>", FOG_PARS_F + "\n" + SKY_LOOKUP)
      .replace("#include <fog_fragment>", FOG_F);
    if (hook) hook(sh);
    if (PARAMS.has("shaders")) {
      (window.__owShaders = window.__owShaders || {})[key] = { vs: sh.vertexShader, fs: sh.fragmentShader };
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/* ============================================================
   Sky - a Preetham atmosphere, evaluated in JS into a small
   lookup table. The dome, the haze on every object and the
   reflection in the lake all read the same table, so they can
   never disagree about what colour the sky is.
   ============================================================ */

const LUT_W = 160, LUT_H = 72;
const lutData = new Uint16Array(LUT_W * LUT_H * 4);
const skyLUT = new THREE.DataTexture(lutData, LUT_W, LUT_H, THREE.RGBAFormat, THREE.HalfFloatType);
skyLUT.magFilter = skyLUT.minFilter = THREE.LinearFilter;
skyLUT.wrapS = skyLUT.wrapT = THREE.ClampToEdgeWrapping;
skyLUT.generateMipmaps = false;
skyLUT.needsUpdate = true;
SH.uSkyLUT.value = skyLUT;

const half = THREE.DataUtils.toHalfFloat;

const SKY = {
  turbidity: 2.6,
  rayleigh: 1.9,
  mieCoefficient: 0.0045,
  mieG: 0.80,
  scale: 0.085,          // Preetham radiance -> the range the tone mapper likes
};

const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const RAY_ZENITH = 8.4e3, MIE_ZENITH = 1.25e3;

/* everything about the sky that depends only on where the sun is */
function skyState(sunY) {
  const sunfade = 1 - clamp01(1 - Math.exp(sunY * 6.0));
  const cutoff = 1.6110731556870734, steep = 1.5, EE = 1000;
  const za = Math.acos(clamp(sunY, -1, 1));
  const sunE = EE * Math.max(0, 1 - Math.exp(-((cutoff - za) / steep)));
  const rc = SKY.rayleigh - (1 - sunfade);
  const c = 0.2 * SKY.turbidity * 1e-17;
  const betaR = TOTAL_RAYLEIGH.map((v) => v * rc);
  const betaM = MIE_CONST.map((v) => 0.434 * c * v * SKY.mieCoefficient);
  return { betaR, betaM, sunE, sunfade, sunY };
}

const _sr = [0, 0, 0];
function skyRadiance(dirY, cosTheta, S, out) {
  const up = Math.max(0, dirY);
  const za = Math.acos(up);
  const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - (za * 180) / Math.PI, -1.253));
  const sR = RAY_ZENITH * inv, sM = MIE_ZENITH * inv;

  const ct = clamp(cosTheta, -1, 1);
  const rPhase = (3 / (16 * Math.PI)) * (1 + Math.pow(ct * 0.5 + 0.5, 2));
  const g2 = SKY.mieG * SKY.mieG;
  const mPhase = (1 / (4 * Math.PI)) * ((1 - g2) /
    Math.pow(Math.max(0, 1 - 2 * SKY.mieG * ct + g2), 1.5));

  const sunUp = Math.pow(clamp01(1 - S.sunY), 5);
  for (let i = 0; i < 3; i++) {
    const bR = S.betaR[i], bM = S.betaM[i];
    const Fex = Math.exp(-(bR * sR + bM * sM));
    const ratio = (bR * rPhase + bM * mPhase) / (bR + bM);
    let Lin = Math.pow(S.sunE * ratio * (1 - Fex), 1.5);
    const near = Math.pow(Math.max(1e-6, S.sunE * ratio * Fex), 0.5);
    Lin *= lerp(1, Math.min(near, 3.2), clamp01(sunUp));
    const L0 = 0.1 * Fex;
    out[i] = (Lin + L0) * 0.04 * SKY.scale;
  }
  out[1] += 0.00008; out[2] += 0.0002;
  return out;
}

function fillSkyLUT(sunDirY) {
  const S = skyState(sunDirY);
  let p = 0;
  for (let j = 0; j < LUT_H; j++) {
    const dy = (j + 0.5) / LUT_H * 2 - 1;
    for (let i = 0; i < LUT_W; i++) {
      const ang = (i + 0.5) / LUT_W * Math.PI;
      skyRadiance(dy, Math.cos(ang), S, _sr);
      /* below the horizon there is ground, not sky: keep the hue, drop the light */
      const k = dy < 0 ? lerp(1, 0.42, clamp01(-dy * 3.4)) : 1;
      lutData[p++] = half(_sr[0] * k);
      lutData[p++] = half(_sr[1] * k);
      lutData[p++] = half(_sr[2] * k);
      lutData[p++] = half(1);
    }
  }
  skyLUT.needsUpdate = true;
  return S;
}

/* ---- the dome ---- */

const SKY_VERT = [
  "varying vec3 vDir;",
  "void main() {",
  "  vDir = position;",
  "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
  "}",
].join("\n");

const SKY_FRAG = [
  "varying vec3 vDir;",
  "uniform sampler2D uSkyLUT, uNoise;",
  "uniform vec3 uSunDir, uSunCol;",
  "uniform float uTime, uCover, uCloud;",
  SKY_LOOKUP,
  /* Three octaves, the first of which drags the other two around with it.
     That warp is what stops cloud noise reading as noise and starts it
     reading as weather. */
  "float clouds( vec2 p ) {",
  "  float w = texture2D( uNoise, p * 0.29 ).b;",
  "  vec2 q = p + vec2( w, w * 0.72 ) * 0.30;",
  "  return texture2D( uNoise, q ).r * 0.55",
  "       + texture2D( uNoise, q * 2.3 + 7.1 ).g * 0.29",
  "       + texture2D( uNoise, q * 5.7 + 2.3 ).b * 0.16;",
  "}",
  "void main() {",
  "  vec3 d = normalize( vDir );",
  "  vec3 col = skyLook( d, uSkyLUT, uSunDir );",
  "  float ct = dot( d, uSunDir );",
  "  float toSun = max( ct, 0.0 );",
  /* the disk, half a degree across, and the halo that always rings it */
  "  col += uSunCol * smoothstep( 0.99977, 0.99990, ct ) * 44.0;",
  "  col += uSunCol * pow( toSun, 300.0 ) * 2.2;",
  "  col += uSunCol * pow( toSun, 16.0 ) * 0.10;",
  "  if ( d.y > 0.003 ) {",
  /* Cumulus on a sheet overhead. Dividing by a softened d.y keeps the
     horizon from smearing into streaks the way a true plane would. */
  "    float lift = d.y + 0.055;",
  "    vec2 p = d.xz / lift * 0.34 + vec2( uTime * 0.0045, uTime * 0.0012 );",
  "    float n = clouds( p );",
  "    float horizon = smoothstep( 0.003, 0.16, d.y );",
  "    float cov = smoothstep( uCover, uCover + 0.19, n ) * horizon;",
  "    float thick = clamp( ( n - uCover ) * 2.4, 0.0, 1.0 );",
  /* grey underneath where it is deep, bright where it is thin, and a lit
     rim on whichever side faces the sun */
  "    vec3 cl = mix( vec3( 1.24, 1.23, 1.21 ), vec3( 0.40, 0.43, 0.51 ), thick ) * uSunCol;",
  "    cl += uSunCol * pow( toSun, 7.0 ) * ( 1.0 - thick ) * 2.4;",
  "    col = mix( col, cl, cov * uCloud );",
  /* and a far higher sheet of cirrus, drawn out into streaks by the wind */
  "    vec2 q = d.xz / ( d.y + 0.018 ) * vec2( 0.19, 0.70 ) + vec2( uTime * 0.0016, 0.0 );",
  "    vec2 c2 = texture2D( uNoise, q ).gr;",
  "    float cir = smoothstep( 0.58, 0.88, c2.x * 0.66 + c2.y * 0.34 ) * smoothstep( 0.02, 0.30, d.y ) * 0.26;",
  "    col = mix( col, uSunCol * ( 1.02 + pow( toSun, 5.0 ) * 1.6 ), cir * uCloud );",
  "  }",
  "  gl_FragColor = vec4( col, 1.0 );",
  "}",
].join("\n");

/* ============================================================
   The last pass: expose, tone map, grade, and only then write
   something a screen can show. Everything before this point is
   linear light, which is why the sun can be a hundred times
   brighter than the grass and still not just come out white.
   ============================================================ */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.05 },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.030 },
    uUnder: { value: 0 },
    uSat: { value: 1.045 },
    uContrast: { value: 0.16 },
  },
  vertexShader: [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "}",
  ].join("\n"),
  fragmentShader: [
    "uniform sampler2D tDiffuse;",
    "uniform float uExposure, uTime, uVignette, uGrain, uUnder, uSat, uContrast;",
    "varying vec2 vUv;",
    "vec3 aces( vec3 x ) {",
    "  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;",
    "  return clamp( ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ), 0.0, 1.0 );",
    "}",
    "void main() {",
    "  vec2 uv = vUv;",
    "  vec2 off = uv - 0.5;",
    "  float r2 = dot( off, off );",
    "  if ( uUnder > 0.0 ) {",
    "    uv += vec2( sin( uv.y * 26.0 + uTime * 2.1 ), cos( uv.x * 21.0 - uTime * 1.7 ) ) * 0.0026 * uUnder;",
    "  }",
    "  float ca = 0.0020 * r2;",
    "  vec3 col;",
    "  col.r = texture2D( tDiffuse, uv + off * ca ).r;",
    "  col.g = texture2D( tDiffuse, uv ).g;",
    "  col.b = texture2D( tDiffuse, uv - off * ca ).b;",
    "  col *= uExposure;",
    "  if ( uUnder > 0.0 ) col *= mix( vec3( 1.0 ), vec3( 0.32, 0.72, 0.84 ), uUnder );",
    "  col = aces( col );",
    "  float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );",
    "  col = max( mix( vec3( l ), col, uSat ), 0.0 );",
    /* an S-curve rather than a pivot: it firms up the midtones without
       shutting the shadows to pure black */
    "  col = mix( col, col * col * ( 3.0 - 2.0 * col ), uContrast );",
    "  col *= 1.0 - uVignette * pow( clamp( r2 * 2.0, 0.0, 1.0 ), 1.5 ) * 0.30;",
    "  float n = fract( sin( dot( uv * 1753.0 + fract( uTime ) * 91.0, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );",
    "  col += ( n - 0.5 ) * uGrain;",
    "  col = pow( max( col, 0.0 ), vec3( 0.4545454 ) );",
    "  gl_FragColor = vec4( col, 1.0 );",
    "}",
  ].join("\n"),
};

/* ---- the post chain ----
   A half-float target, so the scene can stay linear and far brighter than
   white all the way through bloom, and only come back down in the grade. */

let composer = null, bloomPass = null, gradePass = null;
/* replaced by the real preset the first time a detail level is applied */
let quality = { pixel: 1.5, samples: 4, bloom: true };

function pixelRatio() {
  return Math.min(devicePixelRatio || 1, quality.pixel);
}

function makeComposer(q) {
  if (q) quality = q;
  if (composer) {
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
  }
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: quality.samples,
    colorSpace: THREE.NoColorSpace,
  });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.62, 1.05);
  bloomPass.enabled = quality.bloom;
  composer.addPass(bloomPass);
  gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  resize();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  const pr = pixelRatio();
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) {
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
  }
}

addEventListener("resize", resize);

export {
  canvas, renderer, scene, camera, MAX_ANISO, SH, FOG_PARS_V, FOG_V, FOG_PARS_F, SKY_LOOKUP, FOG_F, dress, skyLUT, SKY, fillSkyLUT, SKY_VERT, SKY_FRAG, GradeShader, composer, gradePass, makeComposer, resize, pixelRatio,
};
