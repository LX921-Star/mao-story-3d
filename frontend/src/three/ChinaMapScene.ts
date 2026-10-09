/**
 * 毛泽东生平时空叙事 3D 地图 —— 主场景核心引擎
 * ---------------------------------------------------------------
 * 职责：
 *   1. 初始化 Three.js 渲染器 / 场景 / 相机 / 灯光 / 后期
 *   2. 依据 GeoJSON 生成「带挤出厚度的 3D 立体中国地图」
 *   3. 生成星火粒子系统（点位光点 + 燎原粒子）
 *   4. 提供缓动、镜头运镜、resize 自适应等基础能力
 *
 * 视觉基调：庄重红 + 烫金，暗调哑光，柔和环境光，史诗电影感。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CHINA_GEOJSON } from '../data/chinaGeo';

/* ============================================================
 * 类型定义
 * ============================================================ */

/** 世界坐标点 */
export interface Vec3Like { x: number; y: number; z: number; }

/** 缓动函数签名 */
export type EaseFn = (t: number) => number;

/** 单个星火状态 */
export interface SparkState {
  index: number;
  data: { year: string; name: string; location: string; title: string; brief: string; bgDesc: string; lat: number; lng: number };
  group: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  pos: THREE.Vector3;
  lit: boolean;
  lightT: number;
  focus: number;
  phase: number;
}

/** 火星粒子束 */
interface Ember {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.PointsMaterial;
  vel: THREE.Vector3[];
  life: number;
  maxLife: number;
}

/** 镜头补间参数 */
export interface CameraTweenOpts {
  from?: { pos: [number, number, number]; target?: [number, number, number] };
  to: { pos: [number, number, number]; target?: [number, number, number] };
  duration?: number;
  ease?: EaseFn;
  onUpdate?: (e: number, raw: number) => void;
  onComplete?: () => void;
}

/* ============================================================
 * 一、全局配置
 * ============================================================ */

/** 配色（庄重红 + 烫金） */
export const PALETTE = {
  bgDeep: 0x08060a,        // 深空底
  bgRed: 0x2a0a0c,         // 暗红底
  provinceTop: 0x7a1418,   // 省域顶面（庄重暗红）
  provinceSide: 0x3d0a0c,  // 省域侧壁（更深）
  border: 0xd4af37,        // 烫金描边
  gold: 0xe8c86a,          // 亮金
  goldBright: 0xf7e2a0,    // 高光金
  sparkCore: 0xffd98a,     // 星火核心
  sparkGlow: 0xff7a2f,     // 星火外焰
  crimson: 0xc41e20,       // 猩红
  emberRed: 0xff3b30,      // 燃焰红
};

/** 地图平面尺寸（世界单位）——按中国经纬度范围等比换算 */
export const MAP = {
  lngMin: 73.5,
  lngMax: 135.1,
  latMin: 17.8,
  latMax: 53.6,
  width: 100,       // 地图世界宽度
  depth: 62,        // 地图世界深度（按纬度跨度等比）
  extrude: 1.6,     // 挤出厚度
  lift: 0.0,        // 抬升高度
};

/**
 * 经纬度 → 世界平面坐标（XZ 平面）
 * 地图中心置于原点，相机正上方俯视时为「横版水平正视」。
 */
export function project(lng: number, lat: number, out: Vec3Like = { x: 0, y: 0, z: 0 }): Vec3Like {
  const nx = (lng - MAP.lngMin) / (MAP.lngMax - MAP.lngMin); // 0..1
  const ny = (lat - MAP.latMin) / (MAP.latMax - MAP.latMin); // 0..1
  out.x = (nx - 0.5) * MAP.width;
  out.z = -(ny - 0.5) * MAP.depth; // 纬度越高越靠 -Z（远离观察者）
  out.y = 0;
  return out;
}

/* ============================================================
 * 二、缓动函数库（全部镜头动画统一使用）
 * ============================================================ */

export const Ease = {
  linear: (t: number) => t,
  /** 三次缓出——起步快，收尾极缓（适合镜头到位） */
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  /** 三次缓入缓出——两端缓，中段快（适合推移） */
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** 五次缓出——更长尾，丝滑电影感 */
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  /** 五次缓入缓出 */
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
  /** 指数缓出——极强减速，适合"缓缓推进" */
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  /** 正弦缓入缓出——最自然的呼吸感 */
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** 回弹缓出——用于星火跳动 */
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  /** 弹性缓出——用于终章特效爆发 */
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

/** 数值插值 */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 限制区间 */
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ============================================================
 * 三、主场景类
 * ============================================================ */

export class ChinaMapScene {
  /* ---- 核心对象 ---- */
  canvas: HTMLCanvasElement;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  controls!: OrbitControls;
  clock: THREE.Clock;
  disposed: boolean;
  rafId: number | null = null;
  time = 0;

  /* ---- 分组 ---- */
  mapGroup!: THREE.Group;
  sparkGroup!: THREE.Group;
  emberGroup!: THREE.Group;

  /* ---- 背景元素 ---- */
  backdrop?: THREE.Mesh;
  backdropMat?: THREE.ShaderMaterial;
  glowDisc?: THREE.Mesh;
  glowMat?: THREE.MeshBasicMaterial;
  starDust?: THREE.Points;
  starDustMat?: THREE.PointsMaterial;

  /* ---- 地图元素 ---- */
  mapBuilt = false;
  provinceMeshes: THREE.Mesh[] = [];
  outlineLines: THREE.LineSegments[] = [];
  goldOverlay?: THREE.Group;
  goldMat?: THREE.MeshBasicMaterial;

  /* ---- 星火 / 粒子 ---- */
  sparks: SparkState[] = [];
  embers: Ember[] = [];

  /* ---- 灯光引用 ---- */
  lights!: {
    key: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
    bottomGlow: THREE.PointLight;
    hemi: THREE.HemisphereLight;
    ambient: THREE.AmbientLight;
  };

  /* ---- 内部状态 ---- */
  onResize: () => void;
  _camTweenToken?: object;
  _frameHook?: (dt: number, t: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.disposed = false;

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initLights();
    this.initGroups();
    this.initControls();

    // resize 自适应
    this.onResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.handleResize();

    this.animate = this.animate.bind(this);
  }

  /* ---- 渲染器 ---- */
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(PALETTE.bgDeep, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; // 哑光柔和，无需硬阴影
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
  }

  /* ---- 场景与雾 ---- */
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.bgDeep);
    // 远景雾，营造深邃空间感（不遮挡地图主体）
    this.scene.fog = new THREE.Fog(PALETTE.bgDeep, 150, 420);
  }

  /* ---- 相机 ---- */
  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      3000
    );
    // 初始：斜俯视全景（阶段 1 会被入场动画接管）
    this.camera.position.set(0, 118, 96);
    this.camera.lookAt(0, 0, 0);
  }

  /* ---- 灯光（柔和环境光 + 主光 + 红金补光） ---- */
  initLights() {
    // 环境光：整体提亮，哑光基色
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    // 半球光：天空冷调 / 地面暖红，塑造立体感
    const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a0508, 0.85);
    hemi.position.set(0, 120, 0);
    this.scene.add(hemi);

    // 主平行光：从左上打光，突出挤出厚度
    const key = new THREE.DirectionalLight(0xfff0d0, 1.25);
    key.position.set(-70, 110, 60);
    this.scene.add(key);

    // 金色轮廓补光：从右后方勾勒边缘
    const rim = new THREE.DirectionalLight(PALETTE.gold, 0.7);
    rim.position.set(80, 60, -90);
    this.scene.add(rim);

    // 底部红色反光：让地图侧面泛红，庄重氛围
    const bottomGlow = new THREE.PointLight(PALETTE.crimson, 60, 300, 2);
    bottomGlow.position.set(0, -30, 0);
    this.scene.add(bottomGlow);

    // 保留引用以便后续动态调节
    this.lights = { key, rim, bottomGlow, hemi, ambient };
  }

  /* ---- 场景分组 ---- */
  initGroups() {
    // 地图总组（用于整体旋转 / 竖版↔水平翻转）
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    // 星火总组
    this.sparkGroup = new THREE.Group();
    this.scene.add(this.sparkGroup);

    // 燎原粒子组（阶段 4）
    this.emberGroup = new THREE.Group();
    this.scene.add(this.emberGroup);

    // 背景穹顶（氛围光晕）
    this.buildBackdrop();
    // 地面辉光托盘
    this.buildGlowDisc();
    // 远处星尘
    this.buildStarDust();
  }

  /* ---- 交互控制（默认禁用，阶段 5 解锁） ---- */
  initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.7;
    this.controls.panSpeed = 0.5;
    this.controls.minDistance = 45;
    this.controls.maxDistance = 260;
    this.controls.maxPolarAngle = Math.PI * 0.49; // 不允许转到地下
    this.controls.minPolarAngle = Math.PI * 0.08;
    this.controls.enablePan = true;
    this.controls.enabled = false; // 叙事期间锁定
    // 目标点居中
    this.controls.target.set(0, 0, 0);
  }

  /* ============================================================
   * 四、氛围背景元素
   * ============================================================ */

  /** 背景穹顶：渐变红金光晕（用大球体 + 背面渲染 + 顶点色实现） */
  buildBackdrop() {
    const geo = new THREE.SphereGeometry(900, 32, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x1a0a10) },
        uBottom: { value: new THREE.Color(0x05040a) },
        uGlow: { value: new THREE.Color(0x5c1015) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uGlow;
        uniform float uTime;
        varying vec3 vPos;
        void main() {
          vec3 dir = normalize(vPos);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uBottom, uTop, smoothstep(0.25, 0.95, h));
          // 中心暖红光晕，随呼吸轻微起伏
          float core = pow(max(0.0, 1.0 - length(vec2(dir.x, dir.z)) * 1.6), 2.0);
          float pulse = 0.85 + 0.15 * sin(uTime * 0.6);
          col += uGlow * core * 0.55 * pulse;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.backdropMat = mat;
    this.backdrop = new THREE.Mesh(geo, mat);
    this.scene.add(this.backdrop);
  }

  /** 地图下方辉光托盘：径向渐变红金光晕，承托整张地图 */
  buildGlowDisc() {
    const size = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(200,60,40,0.75)');
    g.addColorStop(0.35, 'rgba(150,30,28,0.35)');
    g.addColorStop(0.7, 'rgba(80,10,14,0.12)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(MAP.width * 2.6, MAP.depth * 2.8);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    });
    this.glowMat = mat;
    this.glowDisc = new THREE.Mesh(geo, mat);
    this.glowDisc.rotation.x = -Math.PI / 2;
    this.glowDisc.position.y = MAP.lift - 1.2;
    this.scene.add(this.glowDisc);
  }

  /** 远处星尘：漂浮微粒，增强空间纵深 */
  buildStarDust() {
    const N = 900;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const gold = new THREE.Color(PALETTE.goldBright);
    const crimson = new THREE.Color(PALETTE.crimson);
    for (let i = 0; i < N; i++) {
      const r = 180 + Math.random() * 480;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = (Math.random() - 0.2) * 260;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = Math.random() > 0.6 ? gold : crimson;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // 柔和圆形贴图
    const tex = this.makeSoftDotTexture();
    const mat = new THREE.PointsMaterial({
      size: 2.4,
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.starDust = new THREE.Points(geo, mat);
    this.scene.add(this.starDust);
  }

  /** 生成柔和的圆形光点贴图（复用于星火/星尘） */
  makeSoftDotTexture(size = 128) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,240,200,0.85)');
    g.addColorStop(0.5, 'rgba(255,180,90,0.35)');
    g.addColorStop(1.0, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ============================================================
   * 五、构建 3D 立体中国地图
   * ============================================================ */

  /** GeoJSON 环 → THREE.Shape（处理多环 holes） */
  ringToShape(rings: number[][][]): THREE.Shape {
    const shape = new THREE.Shape();
    rings.forEach((ring, ri) => {
      const pts = ring.map(([lng, lat]) => {
        const p = project(lng, lat);
        return new THREE.Vector2(p.x, -p.z); // Shape 在 XY 平面，之后旋转到 XZ
      });
      if (pts.length < 3) return;
      if (ri === 0) {
        shape.setFromPoints(pts);
      } else {
        const hole = new THREE.Path();
        hole.setFromPoints(pts);
        shape.holes.push(hole);
      }
    });
    return shape;
  }

  /** 构建地图主体（省域挤出几何） */
  buildMap(onProgress?: (count: number) => void): number {
    const geoData = CHINA_GEOJSON as unknown as {
      features: Array<{ name: string; adcode: number; geometry: { type: string; coordinates: number[][][] | number[][][][] } }>;
    };
    const features = (geoData.features || []).filter((f) => f.name);

    // 省域挤出材质：哑光红，顶面稍亮
    // 每个省份材质做轻微明度抖动，保持庄重红基调的同时营造省域层次
    const makeTopMat = () => {
      const jitter = 0.88 + Math.random() * 0.24; // 0.88 ~ 1.12
      const base = new THREE.Color(PALETTE.provinceTop);
      base.multiplyScalar(jitter);
      return new THREE.MeshStandardMaterial({
        color: base,
        roughness: 0.82,      // 哑光
        metalness: 0.25,
        emissive: new THREE.Color(0x2a0508),
        emissiveIntensity: 0.6,
        flatShading: false,
      });
    };
    const extrudeOpts = {
      depth: MAP.extrude,
      bevelEnabled: true,
      bevelThickness: 0.18,
      bevelSize: 0.16,
      bevelSegments: 1,
      curveSegments: 1,
    };

    this.provinceMeshes = [];
    let count = 0;

    features.forEach((feat) => {
      const geom = feat.geometry;
      const polys: number[][][][] =
        geom.type === 'Polygon'
          ? [geom.coordinates as number[][][]]
          : (geom.coordinates as number[][][][]);

      polys.forEach((poly) => {
        let shape;
        try {
          shape = this.ringToShape(poly);
        } catch (e) {
          return;
        }
        let ext;
        try {
          ext = new THREE.ExtrudeGeometry(shape, extrudeOpts);
        } catch (e) {
          return;
        }
        // ExtrudeGeometry 生成在 XY 平面挤出到 +Z，需旋转为 XZ 平面
        ext.rotateX(-Math.PI / 2);
        // 计算法线以获得正确光照
        ext.computeVertexNormals();

        const mesh = new THREE.Mesh(ext, makeTopMat());
        mesh.position.y = MAP.lift;
        mesh.userData = { province: feat.name, adcode: feat.adcode };
        this.mapGroup.add(mesh);
        this.provinceMeshes.push(mesh);
        count++;

        // 省界描边（烫金）
        this.buildProvinceOutline(poly, feat.name);
      });
    });

    this.mapBuilt = true;
    if (onProgress) onProgress(count);
    return count;
  }

  /** 省界描边：沿经纬轮廓生成金色细线，凸出立体勾勒感 */
  buildProvinceOutline(rings: number[][][], _name?: string) {
    const positions: number[] = [];
    rings.forEach((ring) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = project(ring[i][0], ring[i][1]);
        const b = project(ring[i + 1][0], ring[i + 1][1]);
        positions.push(a.x, MAP.lift + MAP.extrude + 0.06, a.z);
        positions.push(b.x, MAP.lift + MAP.extrude + 0.06, b.z);
      }
    });
    if (!positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: PALETTE.border,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.LineSegments(geo, mat);
    this.mapGroup.add(line);
    this.outlineLines = this.outlineLines || [];
    this.outlineLines.push(line);
  }

  /** 地图整体辉光（阶段 4 鎏金覆盖：用一层叠加的发光轮廓面） */
  buildGoldOverlay() {
    // 使用与省域相同的 Shape 生成一层「顶面薄片」，镀金叠加
    const geoData = CHINA_GEOJSON;
    const features = (geoData.features || []).filter((f) => f.name);
    const group = new THREE.Group();

    const goldMat = new THREE.MeshBasicMaterial({
      color: PALETTE.goldBright,
      transparent: true,
      opacity: 0.0, // 由阶段 4 动画驱动
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.goldMat = goldMat;

    features.forEach((feat) => {
      const geom = feat.geometry;
      const polys: number[][][][] =
        geom.type === 'Polygon'
          ? [geom.coordinates as number[][][]]
          : (geom.coordinates as number[][][][]);
      polys.forEach((poly) => {
        let shape;
        try {
          shape = this.ringToShape(poly);
        } catch (e) {
          return;
        }
        let g;
        try {
          g = new THREE.ShapeGeometry(shape);
        } catch (e) {
          return;
        }
        g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, goldMat);
        m.position.y = MAP.lift + MAP.extrude + 0.12;
        group.add(m);
      });
    });

    this.goldOverlay = group;
    this.mapGroup.add(group);
    return group;
  }

  /* ============================================================
   * 六、星火系统
   * ============================================================ */

  /**
   * 为每个事件点位创建「星火」——由核心光球 + 光晕精灵 + 光柱组成
   * @param {Array} points eventPoints 数组
   */
  buildSparks(points: Array<{ year: string; name: string; location: string; title: string; brief: string; bgDesc: string; lat: number; lng: number }>) {
    this.sparks = [];
    const dotTex = this.makeSoftDotTexture(256);

    points.forEach((p: { year: string; name: string; location: string; title: string; brief: string; bgDesc: string; lat: number; lng: number }, i: number) => {
      const pos = project(p.lng, p.lat);
      const grp = new THREE.Group();
      grp.position.set(pos.x, MAP.lift + MAP.extrude, pos.z);

      // 1) 核心光球
      const coreGeo = new THREE.SphereGeometry(0.55, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({
        color: PALETTE.sparkCore,
        transparent: true,
        opacity: 0,
      });
      const core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> = new THREE.Mesh(coreGeo, coreMat);

      // 2) 外层光晕精灵（叠加发光）
      const haloMat = new THREE.SpriteMaterial({
        map: dotTex,
        color: PALETTE.sparkGlow,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo: THREE.Sprite = new THREE.Sprite(haloMat);
      halo.scale.set(11, 11, 1);

      // 3) 竖直光柱（细长闪烁，象征火种）
      const beamGeo = new THREE.CylinderGeometry(0.08, 0.02, 9, 6, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: PALETTE.goldBright,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 4.2;

      grp.add(core, halo, beam);
      grp.visible = false;
      this.sparkGroup.add(grp);

      this.sparks.push({
        index: i,
        data: p,
        group: grp,
        core,
        halo,
        beam,
        pos: new THREE.Vector3(pos.x, MAP.lift + MAP.extrude, pos.z),
        lit: false,
        lightT: 0,      // 点亮进度 0..1
        focus: 0,       // 聚焦强度 0..1（当前漫游点位）
        phase: Math.random() * Math.PI * 2, // 闪烁相位
      });
    });
    return this.sparks;
  }

  /** 点亮第 i 个星火（返回后由 animate 逐帧推进 lightT） */
  lightSpark(i: number) {
    const s = this.sparks[i];
    if (!s) return;
    s.lit = true;
    s.group.visible = true;
  }

  /** 逐帧更新星火外观（依据 lit / focus / 时间） */
  updateSparks(t: number) {
    if (!this.sparks) return;
    for (const s of this.sparks) {
      // 点亮进度平滑推进
      const target = s.lit ? 1 : 0;
      s.lightT = lerp(s.lightT, target, 0.06);
      if (s.lightT < 0.01 && !s.lit) {
        s.group.visible = false;
        continue;
      }
      s.group.visible = true;

      // 呼吸闪烁
      const flicker = 0.72 + 0.28 * Math.sin(t * 2.6 + s.phase);
      // 聚焦放大（设上限，防止相邻光晕叠加过曝成白斑）
      const focusCapped = Math.min(s.focus, 0.6);
      const focusBoost = 1 + focusCapped * 1.6;

      const coreScale = (0.7 + 0.5 * flicker) * focusBoost * s.lightT;
      s.core.scale.setScalar(coreScale);
      s.core.material.opacity = clamp(0.85 * s.lightT + focusCapped * 0.15, 0, 1);

      const haloScale = (7 + 4 * flicker) * focusBoost * s.lightT;
      s.halo.scale.set(haloScale, haloScale, 1);
      s.halo.material.opacity = clamp((0.4 + 0.3 * flicker) * s.lightT + focusCapped * 0.35, 0, 0.95);
      // 聚焦时颜色更金黄
      s.halo.material.color.setHex(
        focusCapped > 0.5 ? PALETTE.sparkCore : PALETTE.sparkGlow
      );

      const beamOp = (0.0 + 0.32 * flicker) * s.lightT + focusCapped * 0.45;
      s.beam.material.opacity = clamp(beamOp, 0, 0.85);
      s.beam.scale.y = 1 + s.focus * 0.6;

      // 竖直上下轻微浮动
      s.group.position.y = s.pos.y + Math.sin(t * 1.6 + s.phase) * 0.16 * s.lightT;
    }
  }

  /* ============================================================
   * 七、燎原粒子（阶段 4）
   * ============================================================ */

  /** 在指定点位爆发一片火星粒子 */
  spawnEmberBurst(origin: THREE.Vector3, count = 60, spread = 22) {
    const pos = new Float32Array(count * 3);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = origin.x;
      pos[i * 3 + 1] = origin.y + MAP.extrude;
      pos[i * 3 + 2] = origin.z;
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * spread;
      vel.push(
        new THREE.Vector3(
          Math.cos(ang) * spd * 0.6,
          6 + Math.random() * 16,
          Math.sin(ang) * spd * 0.6
        )
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = this.makeSoftDotTexture(64);
    const mat = new THREE.PointsMaterial({
      size: 1.9,
      map: tex,
      color: PALETTE.emberRed,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    this.emberGroup.add(pts);

    const ember = { points: pts, geo, mat, vel, life: 0, maxLife: 1.8 + Math.random() * 1.2 };
    this.embers = this.embers || [];
    this.embers.push(ember);
    return ember;
  }

  /** 更新所有火星粒子 */
  updateEmbers(dt: number) {
    if (!this.embers || !this.embers.length) return;
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life += dt;
      const arr = e.geo.attributes.position.array;
      for (let j = 0; j < e.vel.length; j++) {
        const v = e.vel[j];
        arr[j * 3] += v.x * dt;
        arr[j * 3 + 1] += v.y * dt;
        arr[j * 3 + 2] += v.z * dt;
        // 上升减速 + 轻微下落，模拟火星飘散
        v.y -= 14 * dt;
      }
      e.geo.attributes.position.needsUpdate = true;
      const k = e.life / e.maxLife;
      e.mat.opacity = clamp(1 - k, 0, 1);
      e.mat.size = 1.9 * (1 - k * 0.5);
      if (e.life >= e.maxLife) {
        this.emberGroup.remove(e.points);
        e.geo.dispose();
        e.mat.dispose();
        this.embers.splice(i, 1);
      }
    }
  }

  /* ============================================================
   * 八、镜头运镜工具
   * ============================================================ */

  /**
   * 启动一次镜头补间
   * @param {Object} opts
   *   from { pos:[x,y,z], target:[x,y,z] }
   *   to   { pos:[x,y,z], target:[x,y,z] }
   *   duration 秒
   *   ease 缓动函数
   *   onUpdate(t) 每帧回调
   *   onComplete()
   */
  tweenCamera({ from, to, duration = 2, ease = Ease.inOutCubic, onUpdate, onComplete }: CameraTweenOpts) {
    const start = performance.now();
    const f = from || { pos: [0, 0, 0] as [number, number, number] };
    const fromPos = new THREE.Vector3(...f.pos);
    const toPos = new THREE.Vector3(...to.pos);
    const fromTgt = new THREE.Vector3(...(f.target || [0, 0, 0]));
    const toTgt = new THREE.Vector3(...(to.target || [0, 0, 0]));
    const tmpPos = new THREE.Vector3();
    const tmpTgt = new THREE.Vector3();

    const token = {};
    this._camTweenToken = token;

    const step = () => {
      if (this.disposed || this._camTweenToken !== token) return;
      const now = performance.now();
      let t = clamp((now - start) / (duration * 1000), 0, 1);
      const e = ease(t);

      tmpPos.lerpVectors(fromPos, toPos, e);
      tmpTgt.lerpVectors(fromTgt, toTgt, e);
      this.camera.position.copy(tmpPos);
      this.controls.target.copy(tmpTgt);
      this.camera.lookAt(tmpTgt);

      if (onUpdate) onUpdate(e, t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        if (onComplete) onComplete();
      }
    };
    requestAnimationFrame(step);
  }

  /* ============================================================
   * 九、resize 自适应
   * ============================================================ */

  handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // 窄屏动态增大 FOV，保证地图完整入镜
    const baseFov = 42;
    this.camera.fov = w / h < 1 ? baseFov + (1 - w / h) * 22 : baseFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /* ============================================================
   * 十、渲染主循环
   * ============================================================ */

  start() {
    if (this.rafId) return;
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this.animate();
    };
    loop();
  }

  animate() {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time = (this.time || 0) + dt;

    // 星火外观
    this.updateSparks(this.time);
    // 火星粒子
    this.updateEmbers(dt);

    // 背景呼吸
    if (this.backdropMat) this.backdropMat.uniforms.uTime.value = this.time;

    // 星尘缓慢旋转
    if (this.starDust) {
      this.starDust.rotation.y += dt * 0.012;
      this.starDust.rotation.x = Math.sin(this.time * 0.05) * 0.06;
    }

    // 辉光盘呼吸
    if (this.glowMat) {
      this.glowMat.opacity = 0.72 + 0.18 * Math.sin(this.time * 0.8);
    }

    // 鎏金覆盖层闪烁
    if (this.goldMat) {
      this.goldMat.opacity = clamp(
        this.goldMat.opacity,
        0,
        1
      );
    }

    // 控制器阻尼（仅交互阶段生效）
    if (this.controls.enabled) this.controls.update();

    // 额外每帧钩子（由叙事控制器注入）
    if (this._frameHook) this._frameHook(dt, this.time);

    this.renderer.render(this.scene, this.camera);
  }

  /* ---- 销毁 ---- */
  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}

/* ============================================================
 * 十一、后期处理（可选增强：泛光让星火更"燃烧"）
 * ============================================================ */
export function attachBloom(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.85, // strength
    0.7,  // radius
    0.22  // threshold
  );
  composer.addPass(bloom);
  return { composer, bloom };
}
