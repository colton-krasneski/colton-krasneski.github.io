/* ============================================================
   Materials. Every one goes through dress(), which is what gives
   it this world's haze, wind and clock - a material that skips
   it has no aerial perspective and does not move in the wind.
   ============================================================ */

import * as THREE from "three";
import { MAX_ANISO, SH, SKY_LOOKUP, dress } from "./graphics.js";
import { normalFrom, splitCard, texBark, texBlossom, texCloth, texDenim, texEye, texFace, texHair, texLeafCard, texLeather, texMote, texNeedle, texNeedleMass, texNoise, texSand, texSkin, texSoil, texStone, texTuft, texTurf } from "./textures.js";

const TEX = {};

function toMap(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}

function toCard(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = Math.min(8, MAX_ANISO);
  return t;
}

/* colour and cut-out, as two maps - see splitCard */
function cardTex(canvas) {
  const s = splitCard(canvas);
  return { map: toCard(s.color, true), alphaMap: toCard(s.alpha, false) };
}

function surface(mat, normalStrength) {
  return {
    map: toMap(mat.albedo, true),
    normalMap: toMap(normalFrom(mat.height, normalStrength), false),
    rough: mat.rough,
  };
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function buildTextures(step) {
  const G = 512, C = 256;
  await step("turning the soil");
  TEX.turf = surface(texTurf(G), 2.4);
  await step("seeding the turf");
  TEX.soil = surface(texSoil(G), 2.0);
  await step("laying the stone");
  TEX.stone = surface(texStone(G), 3.0);
  await step("washing the sand");
  TEX.sand = surface(texSand(C), 1.6);
  await step("growing the bark");
  TEX.bark = surface(texBark(G), 2.6);
  await step("unfurling the leaves");
  TEX.leaf = [
    cardTex(texLeafCard(C, [46, 82, 30])),
    cardTex(texLeafCard(C, [62, 98, 34])),
    cardTex(texLeafCard(C, [40, 70, 32])),
  ];
  TEX.needle = cardTex(texNeedle(C, [34, 66, 38]));
  TEX.needleFar = cardTex(texNeedleMass(C, [34, 66, 38]));
  TEX.tuft = cardTex(texTuft(C));
  TEX.blossom = cardTex(texBlossom(128));
  TEX.mote = toCard(texMote(64), true);
  await step("dressing the figure");
  TEX.skin = surface(texSkin(C), 1.15);
  TEX.shirt = surface(texCloth(C, [104, 126, 156]), 1.70);
  TEX.denim = surface(texDenim(C), 1.45);
  TEX.hide = surface(texLeather(C), 2.00);
  TEX.hair = surface(texHair(C), 1.40);
  await step("working on the face");
  /* A face gets twice the map the rest of him does. It is the one
     surface anybody looks straight at, and half of what reads as a
     face at all - lips, lashes, stubble - lives in the paint. */
  TEX.face = surface(texFace(512), 1.05);
  TEX.eye = surface(texEye(C), 0.35);
  await step("drawing the weather");
  TEX.noise = toMap(texNoise(256), false);
  SH.uNoise.value = TEX.noise;
}

/* ============================================================
   Materials
   ============================================================ */

/* ---- the ground ----
   Four surfaces blended per pixel from weights carried on the mesh,
   each sampled twice - close and far - so a hillside never shows the
   tile. Normals are perturbed in world space: the ground is mapped
   straight down, so its tangent frame is just the world axes. */

const TERRAIN_PARS = [
  "uniform sampler2D tTurfA, tTurfN, tSoilA, tSoilN, tRockA, tRockN, tSandA, tSandN;",
  "varying vec3 vSplat;",
  "varying vec3 vGW;",
  "varying vec3 vGN;",
].join("\n");

function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, dithering: true,
  });
  return dress(m, "ow-terrain", (sh) => {
    sh.uniforms.tTurfA = { value: TEX.turf.map };
    sh.uniforms.tTurfN = { value: TEX.turf.normalMap };
    sh.uniforms.tSoilA = { value: TEX.soil.map };
    sh.uniforms.tSoilN = { value: TEX.soil.normalMap };
    sh.uniforms.tRockA = { value: TEX.stone.map };
    sh.uniforms.tRockN = { value: TEX.stone.normalMap };
    sh.uniforms.tSandA = { value: TEX.sand.map };
    sh.uniforms.tSandN = { value: TEX.sand.normalMap };

    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aSplat;\n" + TERRAIN_PARS)
      .replace("#include <begin_vertex>", [
        "#include <begin_vertex>",
        "vSplat = aSplat;",
        "vGW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
        "vGN = normalize( mat3( modelMatrix ) * objectNormal );",
      ].join("\n"));

    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + TERRAIN_PARS + [
        "",
        "vec4 blend2( sampler2D t, vec2 a, vec2 b ) {",
        "  return mix( texture2D( t, a ), texture2D( t, b ), 0.42 );",
        "}",
      ].join("\n"))
      .replace("#include <map_fragment>", [
        "float wRock = clamp( vSplat.x, 0.0, 1.0 );",
        "float wSand = clamp( vSplat.y, 0.0, 1.0 );",
        "float wSoil = clamp( vSplat.z, 0.0, 1.0 );",
        "float wTurf = clamp( 1.0 - wRock - wSand - wSoil, 0.0, 1.0 );",
        "vec2 uvA = vGW.xz * 0.30;",
        "vec2 uvB = vGW.xz * 0.047;",
        /* Turf covers most of the world, so it is the one worth sampling
           twice to break up the tile; the other three carry their weight
           on one look each. Every fetch here is paid for by every pixel
           of ground on the screen. */
        "vec3 cTurf = blend2( tTurfA, uvA, uvB ).rgb;",
        "vec3 cSoil = texture2D( tSoilA, uvA ).rgb;",
        "vec3 cRock = texture2D( tRockA, uvA * 0.55 ).rgb;",
        "vec3 cSand = texture2D( tSandA, uvA * 1.3 ).rgb;",
        "vec3 ground = cTurf * wTurf + cSoil * wSoil + cRock * wRock + cSand * wSand;",
        "diffuseColor.rgb *= ground * 0.92;",
      ].join("\n"))
      .replace("#include <roughnessmap_fragment>", [
        "float roughnessFactor = roughness * ( 0.74 + 0.26 * wTurf ) - wRock * 0.12;",
        "roughnessFactor = clamp( roughnessFactor, 0.28, 1.0 );",
      ].join("\n"))
      .replace("#include <normal_fragment_maps>", [
        "{",
        "  vec3 nTurf = texture2D( tTurfN, uvA ).xyz;",
        "  vec3 nSoil = texture2D( tSoilN, uvA ).xyz;",
        "  vec3 nRock = texture2D( tRockN, uvA * 0.55 ).xyz;",
        "  vec3 nSand = texture2D( tSandN, uvA * 1.3 ).xyz;",
        "  vec3 tn = nTurf * wTurf + nSoil * wSoil + nRock * wRock + nSand * wSand;",
        "  tn = normalize( tn * 2.0 - 1.0 );",
        "  vec3 Nw = normalize( vGN );",
        "  vec3 Tw = normalize( vec3( 1.0, 0.0, 0.0 ) - Nw * Nw.x );",
        "  vec3 Bw = normalize( cross( Nw, Tw ) );",
        "  vec3 pert = normalize( Tw * tn.x + Bw * tn.y + Nw * tn.z );",
        "  normal = normalize( ( viewMatrix * vec4( pert, 0.0 ) ).xyz );",
        "}",
      ].join("\n"));
  });
}

/* ---- grass ----
   The blade bends further the higher up it goes, phased by where it
   stands, so a field moves in waves. Lit as if its normal pointed
   straight up: a blade is a sliver of the lawn it grows from, and a
   back face shaded from below would flicker black. A back-lit blade
   also glows, which is most of what makes real grass look real. */

const WIND_VERT = [
  "#include <begin_vertex>",
  "#ifdef USE_INSTANCING",
  "  vec3 iPos = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );",
  "#else",
  "  vec3 iPos = vec3( 0.0 );",
  "#endif",
  "float ph = uTime * 1.6 + iPos.x * 0.31 + iPos.z * 0.23;",
  "float gust = 0.52 + 0.48 * sin( uTime * 0.41 + iPos.x * 0.013 + iPos.z * 0.0095 );",
  "float sway = ( sin( ph ) * 0.6 + sin( ph * 2.3 + 1.7 ) * 0.26 ) * gust;",
  "float bend = clamp( transformed.y, 0.0, 1.0 ); bend *= bend;",
  "transformed.x += sway * bend * 0.42;",
  "transformed.z += sway * bend * 0.21;",
].join("\n");

const UP_NORMAL = [
  "#include <normal_fragment_begin>",
  "normal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );",
].join("\n");

/* Leaves and blades are thin enough to let light through. Two terms: what
   comes through the far side and scatters in every direction, which is
   what keeps a bush from going black when the sun is edge-on to it, and
   the sharp glow you get looking straight into a backlit canopy. */
function translucency(strength) {
  return [
    "#include <lights_fragment_end>",
    "{",
    "  vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );",
    "  float through = max( 0.0, -dot( normal, sunV ) ) * 0.55 + 0.18;",
    "  vec3 vdir = normalize( cameraPosition - vAirW );",
    "  float glow = pow( clamp( dot( vdir, -uSunDir ), 0.0, 1.0 ), 2.6 );",
    "  reflectedLight.directDiffuse += uSunCol * ( through + glow * 0.85 )",
    "    * " + strength.toFixed(3) + " * diffuseColor.rgb;",
    "}",
  ].join("\n");
}

/* Every blade pointing straight up means every blade takes the light the
   same way, and a field of that reads as a green carpet. So each blade
   gets a fixed lean of its own, deepened by the gust passing over it:
   the light breaks up, and the meadow moves in patches. */
const BLADE_NORMAL = [
  "float lean = 0.30 + sway * 0.44;",
  "float ldir = iPos.x * 1.73 + iPos.z * 2.31;",
  "vBladeN = normalize( vec3( sin( ldir ) * lean, 1.0, cos( ldir ) * lean ) );",
].join("\n");

function grassMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  return dress(m, "ow-grass", (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vBladeN;")
      .replace("#include <begin_vertex>", WIND_VERT + "\n" + BLADE_NORMAL);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBladeN;")
      .replace("#include <normal_fragment_begin>",
        "#include <normal_fragment_begin>\nnormal = normalize( ( viewMatrix * vec4( normalize( vBladeN ), 0.0 ) ).xyz );")
      .replace("#include <lights_fragment_end>", translucency(1.25));
  });
}

/* Cards - grass tufts, leaves, needles, blossom. Cut out by alpha, and
   on a multisampled buffer the cut edge is resolved by coverage, which
   is what keeps a tree from looking like it was stamped out of card. */
function cardMaterial(tex, opts) {
  const o = opts || {};
  const m = new THREE.MeshLambertMaterial({
    map: tex.map, alphaMap: tex.alphaMap,
    transparent: false, alphaTest: o.alphaTest || 0.26,
    side: THREE.DoubleSide, vertexColors: true,
    depthWrite: true,
  });
  return dress(m, "ow-card-" + (o.key || "a"), (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", o.wind ? WIND_VERT : [
        "#include <begin_vertex>",
        "#ifdef USE_INSTANCING",
        "  vec3 iPos = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );",
        "#else",
        "  vec3 iPos = vec3( 0.0 );",
        "#endif",
        "float tph = uTime * 1.05 + iPos.x * 0.10 + iPos.z * 0.08;",
        "float amp = clamp( transformed.y * 0.5 + 0.5, 0.0, 1.4 );",
        "transformed.x += sin( tph ) * 0.085 * amp;",
        "transformed.z += cos( tph * 0.83 ) * 0.065 * amp;",
      ].join("\n"));
    /* A card is drawn from both sides, and three flips the normal on the
       back face. These normals were splayed outward on purpose - flipping
       one points it into the canopy and the leaf comes out black - so the
       flip is undone here. */
    sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>",
      o.up ? UP_NORMAL : "#include <normal_fragment_begin>\nnormal = normal * faceDirection;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <lights_fragment_end>", translucency(o.trans === undefined ? 0.9 : o.trans));
  });
}

/* Solid props - trunks, branches, stones. Real normal maps on real UVs. */
function propMaterial(surf, key, opts) {
  const o = opts || {};
  const m = new THREE.MeshStandardMaterial({
    map: surf.map, normalMap: surf.normalMap,
    normalScale: new THREE.Vector2(o.normal || 1, o.normal || 1),
    roughness: surf.rough, metalness: 0, vertexColors: true,
  });
  return dress(m, "ow-prop-" + key, null);
}

/* ---- a body ----
   Same deal as a prop, except that skin gets a little of the light that
   went in, bounced about under the surface and came back out somewhere
   else. Without it skin reads as painted plaster: the giveaway is the
   terminator, which on a person is a soft red band and on plaster is a
   hard grey line. The term below is the light *beyond* Lambert, so it
   is zero on the fully lit side and only shows where it should. */
function bodyMaterial(surf, key, opts) {
  const o = opts || {};
  const m = new THREE.MeshStandardMaterial({
    map: surf.map, normalMap: surf.normalMap,
    normalScale: new THREE.Vector2(o.normal || 1, o.normal || 1),
    roughness: o.rough === undefined ? surf.rough : o.rough,
    metalness: 0, vertexColors: true,
  });
  if (o.hide) { m.colorWrite = false; m.depthWrite = false; }
  return dress(m, "ow-body-" + key, !o.wrap ? null : (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", [
      "#include <lights_fragment_end>",
      "{",
      "  vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );",
      "  float nl = dot( normal, sunV );",
      "  float extra = max( 0.0, ( nl + 0.45 ) / 1.45 ) - max( 0.0, nl );",
      "  reflectedLight.directDiffuse += uSunCol * extra * " + o.wrap.toFixed(3),
      "    * diffuseColor.rgb * vec3( 1.00, 0.56, 0.44 );",
      "}",
    ].join("\n"));
  });
}

/* ---- water ----
   No mirror pass: on open water nearly everything you see reflected is
   the sky, and the sky is already a lookup table. Fresnel decides how
   much of it you get, the depth attribute decides the colour under it. */

const WATER_VERT = [
  "attribute float aDepth;",
  "varying vec3 vW;",
  "varying float vD;",
  "uniform float uTime;",
  "void main() {",
  "  vD = aDepth;",
  "  vec3 p = position;",
  "  float sh = clamp( aDepth * 1.6, 0.0, 1.0 );",
  "  float t = uTime;",
  "  p.y += ( sin( p.x * 0.19 + t * 1.05 ) * 0.085",
  "         + sin( p.z * 0.23 - t * 0.87 ) * 0.070",
  "         + sin( ( p.x + p.z ) * 0.41 + t * 1.70 ) * 0.035 ) * sh;",
  "  vec4 wp = modelMatrix * vec4( p, 1.0 );",
  "  vW = wp.xyz;",
  "  gl_Position = projectionMatrix * viewMatrix * wp;",
  "}",
].join("\n");

const WATER_FRAG = [
  "varying vec3 vW;",
  "varying float vD;",
  "uniform sampler2D uSkyLUT, uNoise;",
  "uniform vec3 uSunDir, uSunCol;",
  "uniform vec4 uAir;",
  "uniform float uTime;",
  SKY_LOOKUP,
  "vec3 ripple( vec2 p, float t, float fade ) {",
  "  vec2 g = vec2( 0.0 );",
  "  g += vec2( 0.95, 0.31 ) * cos( dot( p, vec2( 0.95, 0.31 ) ) * 0.9 + t * 1.5 ) * 0.085;",
  "  g += vec2( -0.42, 0.91 ) * cos( dot( p, vec2( -0.42, 0.91 ) ) * 1.3 - t * 1.9 ) * 0.065;",
  "  g += vec2( 0.70, -0.71 ) * cos( dot( p, vec2( 0.70, -0.71 ) ) * 2.6 + t * 2.7 ) * 0.035 * fade;",
  "  g += vec2( -0.90, -0.44 ) * cos( dot( p, vec2( -0.90, -0.44 ) ) * 5.1 - t * 3.9 ) * 0.018 * fade;",
  "  return normalize( vec3( -g.x, 1.0, -g.y ) );",
  "}",
  "void main() {",
  "  vec3 toCam = cameraPosition - vW;",
  "  float dist = length( toCam );",
  "  vec3 V = toCam / max( dist, 0.0001 );",
  "  float fade = exp( -dist * 0.022 );",
  "  vec3 N = ripple( vW.xz, uTime, fade );",
  "  if ( !gl_FrontFacing ) N = -N;",
  "  float dep = max( vD, 0.0 );",
  "  float fres = pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), 5.0 );",
  "  fres = mix( 0.022, 1.0, fres );",
  "  vec3 R = reflect( -V, N );",
  "  R.y = abs( R.y );",
  "  vec3 refl = skyLook( normalize( R ), uSkyLUT, uSunDir );",
  "  float glint = pow( max( dot( normalize( R ), uSunDir ), 0.0 ), 420.0 );",
  "  refl += uSunCol * glint * 26.0;",
  "  vec3 body = mix( vec3( 0.085, 0.175, 0.170 ), vec3( 0.008, 0.042, 0.062 ), clamp( dep * 0.4, 0.0, 1.0 ) );",
  "  body *= 0.35 + 0.65 * clamp( uSunCol.g * 1.4, 0.0, 1.0 );",
  "  float fn = texture2D( uNoise, vW.xz * 0.045 + vec2( uTime * 0.013, -uTime * 0.009 ) ).r;",
  "  float foam = smoothstep( 0.40, 0.02, dep ) * smoothstep( 0.34, 0.62, fn );",
  "  vec3 col = mix( body, refl, fres );",
  "  col = mix( col, vec3( 0.80, 0.84, 0.82 ) * max( uSunCol.r, 0.25 ), foam * 0.75 );",
  "  float alpha = clamp( mix( 0.30, 0.96, clamp( dep * 1.5, 0.0, 1.0 ) ) + fres * 0.55 + foam, 0.0, 1.0 );",
  "  if ( !gl_FrontFacing ) { col = mix( vec3( 0.03, 0.10, 0.12 ), refl, fres * 0.5 ); alpha = 0.92; }",
  "  gl_FragColor = vec4( col, alpha );",
  /* the same haze as everything else */
  "  vec3 fd = -V;",
  "  vec3 air = skyLook( fd, uSkyLUT, uSunDir );",
  "  float t = max( dist - uAir.x, 0.0 ) / uAir.y;",
  "  float f = 1.0 - exp( -pow( t, uAir.z ) );",
  "  gl_FragColor.rgb = mix( gl_FragColor.rgb, air, clamp( f, 0.0, 1.0 ) );",
  "}",
].join("\n");
export {
  TEX, toMap, toCard, cardTex, surface, nextFrame, buildTextures, terrainMaterial, WIND_VERT, UP_NORMAL, translucency, grassMaterial, cardMaterial, propMaterial, bodyMaterial, WATER_VERT, WATER_FRAG,
};
