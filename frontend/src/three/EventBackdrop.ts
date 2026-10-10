/**
 * EventBackdrop —— 地图事件的 3D 立体背景
 * ============================================================
 * 在中国地图四周布置一圈低多边形剪影场景（360° 环形），
 * 相机飞抵某个事件时，根据事件主题淡入对应的立体背景：
 *
 *   mountain  群山 / 丘陵（默认）
 *   rural     梯田稻田 / 乡村
 *   city      城市天际线 / 城墙
 *   snow      雪山高原
 *   gate      城楼 / 天安门（庆典）
 *
 * 组员扩展新主题：
 *   1. 在 EventTheme 联合类型中加一个名字；
 *   2. 在 THEME_COLORS 加主色；
 *   3. 在 buildTheme() 的 switch 里加一个生成剪影的分支；
 *   4. 在 backdropThemeFromDesc() 加关键词映射。
 */

import * as THREE from 'three';

/** 事件背景主题 */
export type EventTheme = 'mountain' | 'rural' | 'city' | 'snow' | 'gate';

/** 每个主题的剪影配色（前景层 / 远景层 / 强调色），庄重的深色哑光基调 */
const THEME_COLORS: Record<EventTheme, { near: number; far: number; accent: number }> = {
  mountain: { near: 0x2a160b, far: 0x1b0e07, accent: 0x4a2c12 },
  rural:    { near: 0x14200c, far: 0x0d1509, accent: 0x2e4416 },
  city:     { near: 0x261016, far: 0x180a0e, accent: 0x52202c },
  snow:     { near: 0x1a2233, far: 0x101725, accent: 0x3d4f6e },
  gate:     { near: 0x3a0f14, far: 0x24090d, accent: 0x7a2029 },
};

/** 环形半径（略大于地图外接范围，保证任何相机角度都能看到） */
const RING_RADIUS = 165;
/** 每圈剪影的片数（整圆覆盖） */
const SEGMENTS = 7;
/** 剪影条带宽度（略大于每片所需，保证无缝） */
const STRIP_W = (2 * Math.PI * RING_RADIUS) / SEGMENTS + 26;

/** 根据 bgDesc 关键词推断主题 */
export function backdropThemeFromDesc(desc = ''): EventTheme {
  if (/天安门|城楼|开国|大典|庆|胜|旗|阅/.test(desc)) return 'gate';
  if (/雪|高原|冬|寒|峻|长征|草地/.test(desc)) return 'snow';
  if (/城|市|楼|街|报馆|工厂|工运|一大会址|红楼/.test(desc)) return 'city';
  if (/稻|田|乡|村|农|丘陵|湘|井冈|瑞金|根据地/.test(desc)) return 'rural';
  return 'mountain';
}

/* ============================================================
 * 剪影形状生成（每种返回一条顶部轮廓的 THREE.Shape）
 * ============================================================ */

function shapeFromProfile(pts: Array<[number, number]>): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-STRIP_W / 2, -90);
  pts.forEach(([x, y]) => s.lineTo(x, y));
  s.lineTo(STRIP_W / 2, -90);
  s.closePath();
  return s;
}

/** 连绵群山轮廓 */
function mountainProfile(seed: number, base: number, amp: number): THREE.Shape {
  const pts: Array<[number, number]> = [];
  let x = -STRIP_W / 2;
  let i = 0;
  while (x < STRIP_W / 2) {
    const w = 34 + ((seed * (i + 3) * 37) % 30);
    const h = base + ((seed * (i + 5) * 53) % amp);
    pts.push([x + w * 0.5, h]);
    pts.push([x + w, base * 0.45]);
    x += w;
    i += 1;
  }
  return shapeFromProfile(pts);
}

/** 乡村梯田 / 圆顶丘陵轮廓 */
function ruralProfile(seed: number): THREE.Shape {
  const pts: Array<[number, number]> = [];
  let x = -STRIP_W / 2;
  let i = 0;
  while (x < STRIP_W / 2) {
    const w = 40 + ((seed * (i + 2) * 31) % 22);
    const h = 10 + ((seed * (i + 4) * 41) % 16);
    pts.push([x + w * 0.25, h * 0.6]);
    pts.push([x + w * 0.5, h]);
    pts.push([x + w * 0.75, h * 0.6]);
    pts.push([x + w, 4]);
    x += w;
    i += 1;
  }
  return shapeFromProfile(pts);
}

/** 城市天际线（楼块 + 尖顶） */
function cityProfile(seed: number): THREE.Shape {
  const pts: Array<[number, number]> = [];
  let x = -STRIP_W / 2;
  let i = 0;
  while (x < STRIP_W / 2) {
    const w = 14 + ((seed * (i + 3) * 29) % 18);
    const h = 12 + ((seed * (i + 6) * 47) % 40);
    pts.push([x, 2]);
    pts.push([x, h]);
    if (i % 3 === 0) pts.push([x + w * 0.5, h + 9]); // 尖顶
    pts.push([x + w, h]);
    pts.push([x + w, 2]);
    x += w;
    i += 1;
  }
  return shapeFromProfile(pts);
}

/** 雪山尖峰轮廓（高而锐利） */
function snowProfile(seed: number): THREE.Shape {
  const pts: Array<[number, number]> = [];
  let x = -STRIP_W / 2;
  let i = 0;
  while (x < STRIP_W / 2) {
    const w = 56 + ((seed * (i + 3) * 37) % 30);
    const h = 42 + ((seed * (i + 5) * 59) % 34);
    pts.push([x + w * 0.5, h]);
    pts.push([x + w * 0.72, h * 0.5]);
    pts.push([x + w, 6]);
    x += w;
    i += 1;
  }
  return shapeFromProfile(pts);
}

/** 城楼剪影（墩台 + 两层飞檐），一条轮廓画完 */
function gateProfile(): THREE.Shape {
  const pts: Array<[number, number]> = [];
  const x0 = -30;
  pts.push([x0, 2]);
  pts.push([x0, 16]);                    // 墩台起
  pts.push([x0 + 6, 16]);
  pts.push([x0 + 6, 26]);                // 一层檐
  pts.push([x0 + 2, 26]);
  pts.push([x0 + 2, 30]);
  pts.push([x0 + 10, 30]);
  pts.push([x0 + 10, 40]);               // 二层檐
  pts.push([x0 + 5, 40]);
  pts.push([x0 + 5, 44]);
  pts.push([x0 + 30, 44]);
  pts.push([x0 + 30, 40]);
  pts.push([x0 + 25, 40]);
  pts.push([x0 + 25, 30]);
  pts.push([x0 + 33, 30]);
  pts.push([x0 + 33, 26]);
  pts.push([x0 + 29, 26]);
  pts.push([x0 + 29, 16]);
  pts.push([x0 + 35, 16]);
  pts.push([x0 + 35, 2]);
  // 城墙向两侧延伸
  pts.push([STRIP_W / 2, 2]);
  return shapeFromProfile(pts);
}

/* ============================================================
 * 主类
 * ============================================================ */

export class EventBackdrop {
  /** 场景引用 */
  scene: THREE.Scene;
  /** 根组：整体围绕地图中心 */
  group: THREE.Group;
  /** 当前主题 */
  theme: EventTheme | null = null;
  /** 目标不透明度（0 隐藏，1 显示） */
  private targetOpacity = 0;
  /** 当前不透明度 */
  private opacity = 0;
  /** 当前主题所有材质（用于统一淡入淡出） */
  private mats: THREE.MeshBasicMaterial[] = [];
  /** 漂移动画相位 */
  private t = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
  }

  /** 显示某个主题（同主题重复调用只做淡入） */
  show(theme: EventTheme): void {
    if (this.theme !== theme) this.rebuild(theme);
    this.targetOpacity = 1;
    this.group.visible = true;
  }

  /** 隐藏（淡出） */
  hide(): void {
    this.targetOpacity = 0;
  }

  /** 每帧更新：淡入淡出 + 缓慢漂移 */
  update(dt: number): void {
    if (!this.group.visible && this.opacity <= 0.001) return;
    this.t += dt;
    // 淡入淡出
    this.opacity += (this.targetOpacity - this.opacity) * Math.min(1, dt * 1.6);
    const o = this.opacity;
    this.mats.forEach((m) => { m.opacity = o * m.userData.baseOpacity; });
    if (o <= 0.002 && this.targetOpacity === 0) this.group.visible = false;
    // 缓慢的视差漂移（史诗感）
    this.group.rotation.y = Math.sin(this.t * 0.03) * 0.05;
  }

  /** 释放资源 */
  dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && mat.dispose) mat.dispose();
    });
    this.scene.remove(this.group);
  }

  /* ------------------------------------------------ 内部方法 */

  /** 重建某主题的全部剪影（两层深度 + 环形多片） */
  private rebuild(theme: EventTheme): void {
    // 清空旧内容
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && mat.dispose) mat.dispose();
    });
    this.group.clear();
    this.mats = [];
    this.theme = theme;

    const c = THEME_COLORS[theme];

    // 远景层（更淡、更高）
    this.buildRing(theme, c.far, 0.42, RING_RADIUS + 46, 1.25, theme === 'city' ? 2 : 1);
    // 近景层（更深、主导视觉）
    this.buildRing(theme, c.near, 0.8, RING_RADIUS, 1, 7);
    // 强调层（山间薄雾/金边，theme 相关的低透明装饰）
    if (theme === 'snow') {
      this.buildRing(theme, c.accent, 0.2, RING_RADIUS + 22, 0.85, 3);
    } else if (theme === 'gate') {
      this.buildRing(theme, c.accent, 0.3, RING_RADIUS - 40, 0.55, 2);
    }
  }

  /** 把某主题的剪影条带复制成环形 */
  private buildRing(
    theme: EventTheme,
    color: number,
    baseOpacity: number,
    radius: number,
    heightScale: number,
    seed: number,
  ): void {
    let shape: THREE.Shape;
    switch (theme) {
      case 'rural': shape = ruralProfile(seed); break;
      case 'city': shape = cityProfile(seed); break;
      case 'snow': shape = snowProfile(seed); break;
      case 'gate': shape = gateProfile(); break;
      default: shape = mountainProfile(seed, 16, 34); break;
    }
    const geo = new THREE.ShapeGeometry(shape, 4);
    // 高度缩放
    if (heightScale !== 1) geo.scale(1, heightScale, 1);

    for (let i = 0; i < SEGMENTS; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      mat.userData.baseOpacity = baseOpacity;
      this.mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / SEGMENTS) * Math.PI * 2;
      mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      mesh.rotation.y = angle + Math.PI; // 面向圆心
      this.group.add(mesh);
    }
    this.group.position.y = -12;
  }
}
