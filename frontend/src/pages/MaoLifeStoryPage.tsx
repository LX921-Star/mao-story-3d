/**
 * 毛泽东生平时空叙事 3D 地图 —— 主页面
 * ---------------------------------------------------------------
 * 全屏电影级沉浸式叙事。负责：
 *   1. 挂载全屏 WebGL 画布
 *   2. 初始化 3D 场景 / 叙事控制器 / UI 层
 *   3. 管理阶段 6 的页面滚动与时间轴联动
 *   4. 组件卸载时彻底清理资源
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChinaMapScene } from '../three/ChinaMapScene';
import { NarrativeController } from '../three/NarrativeController';
import type { Pace } from '../three/NarrativeController';
import { NarrativeUI } from '../three/NarrativeUI';
import { eventPoints } from '../data/eventPoints';
import '../styles/epic.css';

const MaoLifeStoryPage = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChinaMapScene | null>(null);
  const ctrlRef = useRef<NarrativeController | null>(null);
  const uiRef = useRef<NarrativeUI | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    /* ---------- 初始化 3D 场景 ---------- */
    const scene = new ChinaMapScene(canvas);
    sceneRef.current = scene;

    /* ---------- 初始化 UI 层 ---------- */
    const ui = new NarrativeUI(root);
    uiRef.current = ui;
    ui.setTotal(eventPoints.length);
    ui.renderTimeline(eventPoints, (i) => {
      ctrl.timelineOpen = true;
      ctrl.focusEventFromTimeline(i);
      // 已在时间轴内，确保地图不关闭
    });

    /* ---------- 初始化叙事控制器 ---------- */
    // 节奏档位：默认 cinematic（影展级完整节奏，最舒缓庄重的史诗感）
    const ctrl = new NarrativeController(scene, ui, 'cinematic');
    ctrlRef.current = ctrl;

    /* ---------- 节奏档位切换 ---------- */
    ui.paceBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pace = (btn.dataset.pace || 'standard') as Pace;
        ctrl.setPace(pace);
        ui.setActivePace(pace);
      });
    });

    /* ---------- 跳过按钮 ---------- */
    ui.skipBtn.addEventListener('click', () => {
      ctrl.skipped = true;
    });

    /* ---------- 启动叙事 ---------- */
    scene.start();
    ctrl.start();

    /* ---------- 阶段 6：滚动展开时间轴 ----------
     * 阶段 5 解锁后，用户向下滚动页面 → 3D 舞台收束置顶，
     * 下方平滑展开竖向生平时间轴。
     */
    let wheelAccum = 0;
    let timelineOpened = false;

    const openTL = () => {
      if (timelineOpened) return;
      timelineOpened = true;
      ui.openTimeline(stageRef.current!);
      document.body.style.overflow = 'hidden';
      setTimeout(() => ui.revealTimelineItems(), 900);
    };
    const closeTL = () => {
      if (!timelineOpened) return;
      timelineOpened = false;
      ui.closeTimeline(stageRef.current!);
      document.body.style.overflow = '';
    };

    const onWheel = (e: WheelEvent) => {
      // 仅阶段 5（已解锁）之后响应
      if (ctrl.phase < 5) return;
      // 时间轴打开时，交给时间轴自身滚动
      if (timelineOpened) {
        const tl = ui.timeline;
        const atTop = tl.scrollTop <= 2;
        if (atTop && e.deltaY < -8) {
          closeTL();
          e.preventDefault();
        }
        return;
      }
      wheelAccum += e.deltaY;
      if (wheelAccum > 120) {
        wheelAccum = 0;
        openTL();
      } else if (wheelAccum < -120) {
        wheelAccum = 0;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (ctrl.phase < 5) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') openTL();
      if (e.key === 'Escape') closeTL();
    };

    // 时间轴滚动时持续显现条目
    const onTLScroll = () => ui.revealTimelineItems();

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    ui.timeline.addEventListener('scroll', onTLScroll);

    /* ---------- 清理 ---------- */
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      ui.timeline.removeEventListener('scroll', onTLScroll);
      if (ctrl._unbindHover) ctrl._unbindHover();
      document.body.style.overflow = '';
      scene.dispose();
      // 清理可能残留的 THREE 缓存（避免热更新时显存泄漏）
      THREE.Cache.clear();
    };
  }, []);

  return (
    <div className="epic-root" ref={rootRef}>
      {/* 3D 舞台：阶段 6 时收束置顶 */}
      <div className="epic-stage-shrink" ref={stageRef}>
        <canvas className="epic-canvas" ref={canvasRef} />
      </div>
    </div>
  );
};

export default MaoLifeStoryPage;
