/**
 * 叙事控制器 —— 驱动六大阶段的时空漫游
 * ---------------------------------------------------------------
 * 阶段 1：开篇入场动画（橘子洲青年毛泽东肖像）
 * 阶段 2：目光牵引转场（肖像 → 竖版 3D 地图 → 水平 3D 地图，星火逐个点亮）
 * 阶段 3：全自动时空漫游（按时间顺序遍历全部事件）
 * 阶段 4：史诗终章特效（星火燎原，金红包裹华夏）
 * 阶段 5：解锁地图自由交互
 * 阶段 6：页面向下滚动，展开竖向人物时间轴
 *
 * 所有镜头动画统一使用缓动函数，节奏舒缓、电影感。
 */

import * as THREE from 'three';
import { project, Ease, lerp, clamp, MAP } from '../three/ChinaMapScene';
import type { ChinaMapScene, CameraTweenOpts } from '../three/ChinaMapScene';
import type { NarrativeUI } from '../three/NarrativeUI';
import { eventPoints } from '../data/eventPoints';
import type { EventPoint } from '../data/eventPoints';

/* ============================================================
 * 节奏档位（毫秒 / 秒）
 * ------------------------------------------------------------
 * 只改这一处即可全局控制叙事快慢：
 *   cinematic 影展档——最舒缓，完整电影感（约 3 分钟）
 *   standard  标准档——兼顾史诗感与节奏（默认，约 1.5 分钟）
 *   brisk     紧凑档——快速通览（约 1 分钟）
 * 想自定义：直接改下方 num 值即可。
 * ============================================================ */
export type Pace = 'cinematic' | 'standard' | 'brisk';

export const PACES: Record<Pace, {
  intro: number; gazeTransition: number; mapFlip: number;
  sparkLightInterval: number; travel: number; dwell: number; finale: number;
}> = {
  cinematic: {
    intro: 4200, gazeTransition: 3800, mapFlip: 3200,
    sparkLightInterval: 260, travel: 3.4, dwell: 3.2, finale: 9000,
  },
  standard: {
    intro: 2400, gazeTransition: 2600, mapFlip: 2200,
    sparkLightInterval: 130, travel: 1.8, dwell: 1.7, finale: 5200,
  },
  brisk: {
    intro: 1500, gazeTransition: 1800, mapFlip: 1500,
    sparkLightInterval: 70, travel: 1.2, dwell: 1.1, finale: 3600,
  },
};

/** 当前生效的节奏参数（默认 standard） */
export const TIMING = { ...PACES.standard };

export class NarrativeController {
  scene: ChinaMapScene;
  ui: NarrativeUI;
  phase = 0;
  running = false;
  skipped = false;
  locked = true;
  timelineOpen = false;
  _unbindHover?: () => void;
  /** 当前节奏档位 */
  pace: Pace = 'standard';
  /** 当前生效的时长参数（由 pace 决定） */
  T: typeof PACES[Pace] = { ...PACES.standard };

  constructor(scene: ChinaMapScene, ui: NarrativeUI, pace: Pace = 'standard') {
    this.scene = scene;
    this.ui = ui;
    this.setPace(pace);
  }

  /** 切换节奏档位（可在启动前调用；运行中调用则仅影响后续段落） */
  setPace(pace: Pace) {
    this.pace = pace;
    this.T = { ...PACES[pace] };
    // 同步导出常量，便于外部读取
    Object.assign(TIMING, this.T);
    return this.T;
  }

  /* ================= 工具：延时（可被中断） ================= */
  wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = () => {
        if (this.scene.disposed) return resolve();
        // 跳过时仍然等待一个极短周期，避免瞬间跑完导致视觉断裂
        if (performance.now() - start >= ms) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /* ================= 启动总流程 ================= */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.phaseIntro();          // 阶段 1
    await this.phaseGazeToMap();      // 阶段 2
    await this.phaseAutoTravel();     // 阶段 3
    await this.phaseFinale();         // 阶段 4
    this.phaseUnlock();               // 阶段 5
  }

  /* ============================================================
   * 阶段 1：开篇入场动画 —— 橘子洲青年毛泽东肖像
   * ============================================================ */
  async phaseIntro() {
    this.phase = 1;
    this.ui.setPhase(1);

    // 相机：极近距离，注视肖像
    this.scene.camera.position.set(0, 6, 46);
    this.scene.controls.target.set(0, 4, 0);
    this.scene.camera.lookAt(0, 4, 0);

    // 播放肖像淡入 + 文字浮现
    this.ui.showIntro();
    await this.wait(this.T.intro);

    // 镜头极缓拉近（模拟"注视"的呼吸感）
    await this._tween({
      to: { pos: [0, 4.4, 38], target: [0, 4, 0] },
      duration: this._scale(2.4),
      ease: Ease.inOutSine,
    });

    if (this.skipped) {
      // 跳过时也要正确清理肖像层，避免 UI 泄漏
      this.ui.hideIntro();
      return;
    }
    this.ui.hideIntro();
    await this.wait(600);
  }

  /* ============================================================
   * 阶段 2：目光牵引转场 —— 肖像 → 竖版 3D 地图 → 水平 3D 地图
   * ============================================================ */
  async phaseGazeToMap() {
    this.phase = 2;
    this.ui.setPhase(2);

    /* --- 2.1 目光牵引：视线沿画面纵深方向延展拉伸 --- */
    this.ui.showGazeHint();
    // 相机快速向"远处"推进，画面拉伸，营造视线穿透感
    await this._tween({
      to: { pos: [0, 3, 8], target: [0, 2, -40] },
      duration: this._scale(1.8),
      ease: Ease.outExpo,
      onUpdate: (e) => {
        // 画面沿视线方向拉伸（FOV 短暂收窄再放开）
        this.scene.camera.fov = 42 - 10 * Math.sin(e * Math.PI);
        this.scene.camera.updateProjectionMatrix();
      },
    });
    this.scene.camera.fov = 42;
    this.scene.camera.updateProjectionMatrix();

    /* --- 2.2 构建 3D 立体中国地图 --- */
    this.ui.showLoading('正在生成华夏版图…');
    // 让出主线程一帧，保证 loading 可见
    await this.wait(120);

    await new Promise<number>((resolve) => {
      // 分帧构建，避免卡顿
      setTimeout(() => {
        const c = this.scene.buildMap();
        resolve(c);
      }, 40);
    });

    this.ui.hideLoading();

    /* --- 2.3 竖版呈现：地图立起为竖直朝向（绕 X 轴旋转 -90°） --- */
    // 初始把地图组「立起来」，面向相机，形成竖版中国
    this.scene.mapGroup.rotation.x = -Math.PI / 2;
    this.scene.mapGroup.position.y = 0;

    // 相机对准竖版地图中心
    this.scene.camera.position.set(0, 2, 92);
    this.scene.controls.target.set(0, 0, 0);
    this.scene.camera.lookAt(0, 0, 0);

    // 竖版地图缓缓浮现（从视线焦点向外展开）
    await this._tween({
      from: { pos: [0, 2, 190], target: [0, 0, 0] },
      to: { pos: [0, 2, 92], target: [0, 0, 0] },
      duration: this._scale(2.6),
      ease: Ease.outQuint,
    });

    if (this.skipped) {
      // 跳过路径：直接落到终态——地图放平、星火全部点亮，保证后续阶段状态正确
      this.scene.mapGroup.rotation.x = 0;
      this.scene.mapGroup.position.y = MAP.lift;
      this.scene.buildSparks(eventPoints);
      this.scene.sparks.forEach((s) => {
        s.lit = true;
        s.lightT = 1;
        s.group.visible = true;
      });
      this.ui.hideLoading();
      return;
    }
    await this.wait(900);

    /* --- 2.4 镜头推进 + 翻转放平：竖版 → 水平正视带挤出厚度的 3D 地图 --- */
    this.ui.showLoading('展开山河…');
    this.scene.mapGroup.rotation.x = 0; // 目标：水平（俯视带厚度）

    await this._tween({
      from: { pos: [0, 2, 92], target: [0, 0, 0] },
      to: { pos: [0, 118, 96], target: [0, 0, 0] },
      duration: this._scale(3.0),
      ease: Ease.inOutQuint,
      onUpdate: (e) => {
        // 地图从竖版平滑翻转放平（-90° → 0°）
        this.scene.mapGroup.rotation.x = lerp(-Math.PI / 2, 0, e);
        // 相机同时抬升，过渡为斜俯视
        this.scene.mapGroup.position.y = lerp(0, MAP.lift, e);
      },
    });
    this.ui.hideLoading();

    /* --- 2.5 星火逐个点亮（按历史时间顺序） --- */
    this.scene.buildSparks(eventPoints);
    this.ui.showLoading('星火初燃…');
    await this.wait(500);
    this.ui.hideLoading();

    for (let i = 0; i < eventPoints.length; i++) {
      this.scene.lightSpark(i);
      // 让星火有"点燃"的顿挫感
      await this.wait(this.T.sparkLightInterval);
      if (this.skipped) break;
    }

    await this.wait(1000);
  }

  /* ============================================================
   * 阶段 3：全自动时空漫游 —— 按时间顺序遍历全部事件
   * ============================================================ */
  async phaseAutoTravel() {
    this.phase = 3;
    this.ui.setPhase(3);
    this.ui.showTravelHud();

    for (let i = 0; i < eventPoints.length; i++) {
      if (this.skipped && i > 2) break;
      await this.travelTo(i);
    }

    this.ui.hideTravelHud();
  }

  /** 飞向第 i 个事件点位：飞行 → 聚焦 → 停留讲述 */
  async travelTo(i: number) {
    const p = eventPoints[i];
    const pos = project(p.lng, p.lat);
    const camY = 46;              // 巡游时的斜俯视高度
    const camDist = 34;           // 与点位的水平距离

    // 目标相机位置：从点的正上方偏南方向俯视
    const toPos: [number, number, number] = [pos.x, camY, pos.z + camDist];
    const toTgt: [number, number, number] = [pos.x, MAP.lift, pos.z];

    // --- 3.1 飞行抵达 ---
    const from = {
      pos: [this.scene.camera.position.x, this.scene.camera.position.y, this.scene.camera.position.z] as [number, number, number],
      target: [this.scene.controls.target.x, this.scene.controls.target.y, this.scene.controls.target.z] as [number, number, number],
    };
    this.ui.updateTravelHud(i, p);

    await this._tween({
      from,
      to: { pos: toPos as [number, number, number], target: toTgt as [number, number, number] },
      duration: this.T.travel,
      ease: Ease.inOutCubic,
      onUpdate: (e) => {
        // 当前点位聚焦强度随飞行推进而增强
        if (this.scene.sparks) {
          this.scene.sparks.forEach((s: { focus: number }, idx: number) => {
            const isCur = idx === i;
            const target = isCur ? e : 0;
            s.focus = lerp(s.focus, target, 0.12);
          });
        }
      },
    });

    if (this.skipped) return;

    // --- 3.2 聚焦完成：背景切换 + 悬浮卡展示 ---
    this.setAmbientForEvent(p);
    this.ui.showEventCard(p, i);

    // 星火跳动聚焦动画
    await this.wait(this.T.dwell);

    // --- 3.3 移出：取消聚焦、收卡片 ---
    this.ui.hideEventCard();
    if (this.scene.sparks) this.scene.sparks[i].focus = 0;
    await this.wait(500);
  }

  /** 依据事件 bgDesc 切换全局氛围背景 */
  setAmbientForEvent(p: EventPoint) {
    // 简单关键词 → 色调映射，营造时代氛围
    const desc = p.bgDesc || '';
    let hue = { r: 0.10, g: 0.02, b: 0.03 };
    if (/海|江|湖|水|雨/.test(desc)) hue = { r: 0.03, g: 0.05, b: 0.10 };
    if (/黄|高原|土|山|峰/.test(desc)) hue = { r: 0.14, g: 0.07, b: 0.03 };
    if (/春|晴|谷|稻|绿|樟|竹/.test(desc)) hue = { r: 0.06, g: 0.09, b: 0.05 };
    if (/雪|冬|夜|暗|肃|静/.test(desc)) hue = { r: 0.05, g: 0.03, b: 0.07 };
    if (/红|旗|火|炮|庆|胜/.test(desc)) hue = { r: 0.20, g: 0.03, b: 0.03 };
    this.ui.setAmbient(hue, p);
  }

  /* ============================================================
   * 阶段 4：史诗终章特效 —— 星火燎原，金红包裹华夏
   * ============================================================ */
  async phaseFinale() {
    this.phase = 4;
    this.ui.setPhase(4);
    this.ui.showFinaleTitle();

    /* --- 4.1 镜头平稳拉远至全国全景俯视 --- */
    const from = {
      pos: [this.scene.camera.position.x, this.scene.camera.position.y, this.scene.camera.position.z] as [number, number, number],
      target: [this.scene.controls.target.x, this.scene.controls.target.y, this.scene.controls.target.z] as [number, number, number],
    };
    await this._tween({
      from,
      to: { pos: [0, 128, 118], target: [0, 0, 0] },
      duration: this._scale(4.0),
      ease: Ease.inOutQuint,
      onUpdate: () => {
        // 所有点位取消聚焦，回归均匀星火
        if (this.scene.sparks) {
          this.scene.sparks.forEach((s: { focus: number }) => (s.focus = lerp(s.focus, 0.12, 0.06)));
        }
      },
    });

    if (this.skipped) {
      // 跳过路径：先将镜头快速归位至全国全景，再呈现终章状态
      await this._tween({
        from: {
          pos: [this.scene.camera.position.x, this.scene.camera.position.y, this.scene.camera.position.z] as [number, number, number],
          target: [this.scene.controls.target.x, this.scene.controls.target.y, this.scene.controls.target.z] as [number, number, number],
        },
        to: { pos: [0, 128, 118], target: [0, 0, 0] },
        duration: 2.0,
        ease: Ease.inOutCubic,
      });
      this.ui.hideFinaleTitle();
      this.applyFinaleState();
      return;
    }

    this.ui.hideFinaleTitle();
    await this.wait(400);

    /* --- 4.2 各地星火从四面八方燃烧、蔓延、串联扩散 --- */
    // 按地理邻近顺序分批爆发火星
    const order = this.scene.sparks
      .map((s: { pos: THREE.Vector3 }, i: number) => ({ i, x: s.pos.x, z: s.pos.z }))
      .sort((a, b) => a.x - b.x + (a.z - b.z) * 0.5);

    const batch = Math.ceil(order.length / 6);
    for (let b = 0; b < 6; b++) {
      for (let k = 0; k < batch; k++) {
        const item = order[b * batch + k];
        if (!item) continue;
        const s = this.scene.sparks[item.i];
        // 每个点位爆发火星并瞬间点亮
        s.lit = true;
        this.scene.spawnEmberBurst(s.pos, 46, 24);
        s.focus = 1.2;
      }
      await this.wait(this.T.finale / 8);
      if (this.skipped) break;
    }

    await this.wait(1200);

    /* --- 4.3 鎏金流光肌理覆盖整片地图 --- */
    this.ui.showLoading('鎏金覆土，红耀九州…');
    await this.wait(300);
    this.ui.hideLoading();

    await this._animateGoldOverlay();
    await this.wait(300);
    this.applyFinaleState();
    await this.wait(1400);
  }

  /** 鎏金覆盖动画：金色叠层逐步浮现 */
  async _animateGoldOverlay(): Promise<void> {
    this.scene.buildGoldOverlay();
    const total = 3.2;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (this.scene.disposed) return resolve();
        const t = clamp((performance.now() - start) / (total * 1000), 0, 1);
        const e = Ease.inOutSine(t);
        if (this.scene.goldMat) this.scene.goldMat.opacity = 0.55 * e;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  /** 应用终章最终视觉状态 */
  applyFinaleState(): void {
    if (!this.scene.goldMat) this.scene.buildGoldOverlay();
    if (this.scene.goldMat) this.scene.goldMat.opacity = 0.55;
    if (this.scene.sparks) {
      this.scene.sparks.forEach((s: { lit: boolean; lightT: number; group: THREE.Group }) => {
        s.lit = true;
        s.lightT = 1;
        s.group.visible = true;
      });
    }
    this.ui.setAmbient({ r: 0.22, g: 0.04, b: 0.04 }, { bgDesc: '史诗终章' });
  }

  /* ============================================================
   * 阶段 5：解锁自由交互
   * ============================================================ */
  phaseUnlock() {
    this.phase = 5;
    this.locked = false;
    this.ui.setPhase(5);
    // 确保终章标题 / 加载提示 / 悬浮卡全部清理（兼容跳过路径）
    this.ui.hideFinaleTitle();
    this.ui.hideLoading();
    this.ui.hideEventCard();
    // 重置星火聚焦残留，避免光晕叠加过曝
    if (this.scene.sparks) {
      this.scene.sparks.forEach((s) => (s.focus = 0.15));
    }
    this.scene.controls.enabled = true;
    this.scene.controls.target.set(0, 0, 0);
    this.ui.showUnlockHint();

    // 绑定悬停预览
    this.bindHoverPreview();
  }

  /** 悬停点位预览事件标题（射线拾取星火） */
  bindHoverPreview() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const canvas = this.scene.canvas;

    const onMove = (ev: PointerEvent) => {
      if (!this.scene.controls.enabled) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, this.scene.camera);

      const cores = this.scene.sparks.map((s: { core: THREE.Mesh }) => s.core);
      const hits = raycaster.intersectObjects(cores, false);
      if (hits.length) {
        const core = hits[0].object;
        const spark = this.scene.sparks.find((s: { core: THREE.Mesh }) => s.core === core);
        if (spark) {
          this.scene.canvas.style.cursor = 'pointer';
          this.ui.showHoverTip(spark.data, ev.clientX, ev.clientY);
          spark.focus = Math.max(spark.focus, 0.8);
          return;
        }
      }
      this.scene.canvas.style.cursor = 'grab';
      this.ui.hideHoverTip();
      this.scene.sparks.forEach((s: { focus: number }) => {
        if (s.focus < 0.9) s.focus = lerp(s.focus, 0, 0.1);
      });
    };

    canvas.addEventListener('pointermove', onMove);
    this._unbindHover = () => canvas.removeEventListener('pointermove', onMove);
  }

  /* ============================================================
   * 阶段 6：点击时间轴 → 拉近地图点位
   * ============================================================ */
  async focusEventFromTimeline(index: number) {
    const p = eventPoints[index];
    if (!p) return;
    this.ui.setAmbient(this.ambientFromDesc(p.bgDesc), p);

    const pos = project(p.lng, p.lat);
    await this._tween({
      from: {
        pos: [this.scene.camera.position.x, this.scene.camera.position.y, this.scene.camera.position.z] as [number, number, number],
        target: [this.scene.controls.target.x, this.scene.controls.target.y, this.scene.controls.target.z] as [number, number, number],
      },
      to: { pos: [pos.x + 6, 44, pos.z + 30], target: [pos.x, MAP.lift, pos.z] },
      duration: 2.2,
      ease: Ease.inOutCubic,
      onUpdate: (e) => {
        if (this.scene.sparks) {
          this.scene.sparks.forEach((s: { focus: number }, idx: number) => {
            s.focus = lerp(s.focus, idx === index ? e * 1.3 : 0, 0.1);
          });
        }
      },
    });
  }

  ambientFromDesc(desc = ''): { r: number; g: number; b: number } {
    let hue = { r: 0.10, g: 0.02, b: 0.03 };
    if (/海|江|湖|水|雨/.test(desc)) hue = { r: 0.03, g: 0.05, b: 0.10 };
    if (/黄|高原|土|山|峰/.test(desc)) hue = { r: 0.14, g: 0.07, b: 0.03 };
    if (/春|晴|谷|稻|绿|樟|竹/.test(desc)) hue = { r: 0.06, g: 0.09, b: 0.05 };
    if (/雪|冬|夜|暗|肃|静/.test(desc)) hue = { r: 0.05, g: 0.03, b: 0.07 };
    if (/红|旗|火|炮|庆|胜/.test(desc)) hue = { r: 0.20, g: 0.03, b: 0.03 };
    return hue;
  }

  /** 镜头时长随节奏档位等比缩放（基准为 standard 档） */
  _scale(baseSeconds: number): number {
    // 以 travel(standard=1.8) 与 cinematic(3.4) 的比值作为缩放系数
    const k = this.T.travel / PACES.standard.travel;
    return Math.max(0.6, baseSeconds * k);
  }

  /* ================= 镜头补间包装（统一走 scene.tweenCamera） ================= */
  _tween(opts: CameraTweenOpts): Promise<void> {
    return new Promise<void>((resolve) => {
      const from = opts.from || {
        pos: [this.scene.camera.position.x, this.scene.camera.position.y, this.scene.camera.position.z] as [number, number, number],
        target: [this.scene.controls.target.x, this.scene.controls.target.y, this.scene.controls.target.z] as [number, number, number],
      };
      this.scene.tweenCamera({
        ...opts,
        from,
        onComplete: () => {
          if (opts.onComplete) opts.onComplete();
          resolve();
        },
      });
    });
  }
}
