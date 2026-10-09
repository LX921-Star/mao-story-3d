/**
 * 叙事 UI 控制器
 * ---------------------------------------------------------------
 * 统一管理所有 DOM 覆盖层的显隐与内容更新：
 *   · 阶段 1 入场肖像
 *   · 阶段 2 目光牵引提示 / 加载提示
 *   · 阶段 3 事件悬浮卡 / 年份横幅
 *   · 阶段 4 终章史诗标题
 *   · 阶段 5 解锁提示 / 悬停气泡
 *   · 阶段 6 竖向时间轴
 * 与 3D 引擎解耦，仅通过方法调用通信。
 */

import type { EventPoint } from '../data/eventPoints';
import type { Pace } from './NarrativeController';

export interface AmbientHue { r: number; g: number; b: number; }

/** 阶段元信息（左侧指示器） */
const PHASES = [
  { id: 1, label: '开篇' },
  { id: 2, label: '版图初现' },
  { id: 3, label: '时空漫游' },
  { id: 4, label: '星火燎原' },
  { id: 5, label: '自由览胜' },
  { id: 6, label: '生平长卷' },
];

export class NarrativeUI {
  root: HTMLElement;

  /* ---- 覆盖层 DOM ---- */
  ambient!: HTMLDivElement;
  vignette!: HTMLDivElement;
  grain!: HTMLDivElement;
  barTop!: HTMLDivElement;
  barBottom!: HTMLDivElement;
  phaseRail!: HTMLDivElement;
  phaseItems: HTMLDivElement[] = [];
  intro!: HTMLDivElement;
  portrait!: HTMLDivElement;
  gaze!: HTMLDivElement;
  loading!: HTMLDivElement;
  loadingText!: HTMLSpanElement;
  yearBanner!: HTMLDivElement;
  ybYear!: HTMLDivElement;
  ybTitle!: HTMLDivElement;
  card!: HTMLDivElement;
  cardIndex!: HTMLDivElement;
  cardYear!: HTMLDivElement;
  cardLoc!: HTMLDivElement;
  cardTitle!: HTMLDivElement;
  cardBrief!: HTMLDivElement;
  finale!: HTMLDivElement;
  unlock!: HTMLDivElement;
  hoverTip!: HTMLDivElement;
  skipBtn!: HTMLButtonElement;
  paceBar!: HTMLDivElement;
  paceBtns: HTMLButtonElement[] = [];
  timeline!: HTMLDivElement;
  tlList!: HTMLDivElement;
  tlItems: HTMLDivElement[] = [];

  /* ---- 状态 ---- */
  phase = 0;
  total = 0;
  timelineOpen = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  /* ============ 构建所有覆盖层 DOM ============ */
  build() {
    const r = this.root;

    // 时代氛围背景
    this.ambient = el('div', 'epic-ambient');

    // 暗角 + 颗粒 + 电影黑边
    this.vignette = el('div', 'epic-vignette');
    this.grain = el('div', 'epic-grain');
    this.barTop = el('div', 'epic-letterbox top');
    this.barBottom = el('div', 'epic-letterbox bottom');

    // 阶段指示器
    this.phaseRail = el('div', 'epic-phase-rail');
    this.phaseItems = PHASES.map((p: { id: number; label: string }) => {
      const item = el('div', 'epic-phase-item');
      item.appendChild(el('span', 'epic-phase-dot'));
      const lab = el('span', 'epic-phase-label');
      lab.textContent = p.label;
      item.appendChild(lab);
      this.phaseRail.appendChild(item);
      return item;
    });

    // 入场肖像层
    this.intro = this.buildIntro();

    // 目光牵引
    this.gaze = el('div', 'epic-gaze');

    // 加载提示
    this.loading = el('div', 'epic-loading');
    this.loading.appendChild(el('span', 'spin'));
    this.loadingText = el('span');
    this.loading.appendChild(this.loadingText);

    // 年份横幅
    this.yearBanner = el('div', 'epic-year-banner');
    this.ybYear = el('div', 'yb-year');
    this.ybTitle = el('div', 'yb-title');
    this.yearBanner.append(this.ybYear, this.ybTitle);

    // 事件悬浮卡
    this.card = this.buildEventCard();

    // 终章标题
    this.finale = el('div', 'epic-finale');
    const fmain = el('div', 'finale-main');
    fmain.textContent = '星星之火 可以燎原';
    const fsub = el('div', 'finale-sub');
    fsub.textContent = '红遍九州 · 换了人间';
    this.finale.append(fmain, fsub);

    // 解锁提示
    this.unlock = el('div', 'epic-unlock');
    const ut = el('div', 'u-title');
    ut.textContent = '自由览胜 · 已解锁';
    const ud = el('div', 'u-desc');
    ud.textContent = '拖拽旋转 · 滚轮缩放 · 悬停预览';
    const us = el('div', 'u-scroll');
    us.textContent = '↓ 向下滚动 · 展开生平长卷';
    this.unlock.append(ut, ud, us);

    // 悬停气泡
    this.hoverTip = el('div', 'epic-hover-tip');

    // 跳过按钮
    this.skipBtn = el('button', 'epic-skip');
    this.skipBtn.textContent = '跳过叙事 ›';

    // 节奏档位切换（叙事期间可随时调整快慢）
    this.paceBar = el('div', 'epic-pace-bar');
    const paceLabel = el('span', 'pace-label');
    paceLabel.textContent = '节奏';
    this.paceBar.appendChild(paceLabel);
    this.paceBtns = [];
    const paceDefs: Array<{ key: Pace; text: string }> = [
      { key: 'cinematic', text: '影展' },
      { key: 'standard', text: '标准' },
      { key: 'brisk', text: '紧凑' },
    ];
    paceDefs.forEach((d) => {
      const btn = el('button', 'pace-btn');
      btn.textContent = d.text;
      btn.dataset.pace = d.key;
      this.paceBar.appendChild(btn);
      this.paceBtns.push(btn);
    });
    this.setActivePace('cinematic');

    // 时间轴
    this.timeline = this.buildTimeline();

    [this.ambient, this.vignette, this.grain, this.barTop, this.barBottom,
     this.phaseRail, this.intro, this.gaze, this.loading, this.yearBanner,
     this.card, this.finale, this.unlock, this.hoverTip, this.skipBtn,
     this.paceBar, this.timeline].forEach((n: HTMLElement) => r.appendChild(n));
  }

  /** 高亮当前节奏档位 */
  setActivePace(pace: Pace) {
    this.paceBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.pace === pace);
    });
  }

  /* ---------- 入场肖像（青年毛泽东 · 远眺山河） ---------- */
  buildIntro() {
    const wrap = el('div', 'epic-intro');
    const portrait = el('div', 'epic-portrait');
    // 用 SVG 精心绘制"青年毛泽东侧身远眺"的剪影肖像（占位，可替换为历史照片）
    portrait.innerHTML = YOUTH_MAO_SVG;

    // 漂浮光斑
    for (let i = 0; i < 14; i++) {
      const m = el('div', 'epic-mote');
      const size = 2 + Math.random() * 4;
      m.style.width = `${size}px`;
      m.style.height = `${size}px`;
      m.style.left = `${20 + Math.random() * 60}%`;
      m.style.bottom = `${5 + Math.random() * 60}%`;
      m.style.animationDuration = `${5 + Math.random() * 5}s`;
      m.style.animationDelay = `${Math.random() * 5}s`;
      portrait.appendChild(m);
    }

    const title = el('div', 'epic-intro-title');
    const h1 = el('h1');
    h1.textContent = '恰同学少年';
    const p = el('p');
    p.textContent = '橘子洲头 · 风华正茂 · 远眺山河';
    title.append(h1, p);

    wrap.append(portrait, title);
    this.portrait = portrait;
    return wrap;
  }

  /* ---------- 事件悬浮卡 ---------- */
  buildEventCard() {
    const card = el('div', 'epic-event-card');
    this.cardIndex = el('div', 'card-index');
    this.cardYear = el('div', 'card-year');
    this.cardLoc = el('div', 'card-loc');
    this.cardTitle = el('div', 'card-title');
    this.cardBrief = el('div', 'card-brief');
    card.append(this.cardIndex, this.cardYear, this.cardLoc, this.cardTitle, this.cardBrief);
    return card;
  }

  /* ---------- 竖向时间轴 ---------- */
  buildTimeline() {
    const wrap = el('div', 'epic-timeline');
    const inner = el('div', 'epic-timeline-inner');

    const head = el('div', 'epic-timeline-head');
    const h2 = el('h2');
    h2.textContent = '生 平 长 卷';
    const hp = el('p');
    hp.textContent = '自韶山冲至天安门 · 一条贯穿世纪的道路';
    const rule = el('div', 'rule');
    head.append(h2, hp, rule);

    this.tlList = el('div', 'epic-tl-list');
    inner.append(head, this.tlList);

    // 落款
    const foot = el('div', 'epic-timeline-foot');
    foot.appendChild(el('div', 'foot-line'));
    const ft = el('div', 'foot-text');
    ft.textContent = '为有牺牲多壮志 · 敢教日月换新天';
    foot.appendChild(ft);
    inner.appendChild(foot);

    wrap.appendChild(inner);
    return wrap;
  }

  /* ============================================================
   * 时间轴条目渲染 + 点击回调
   * ============================================================ */
  renderTimeline(points: EventPoint[], onSelect: (i: number) => void) {
    this.tlList.innerHTML = '';
    this.tlItems = [];
    points.forEach((p: EventPoint, i: number) => {
      const item = el('div', 'epic-tl-item');
      // 头部
      const head = el('div', 'epic-tl-head');
      const year = el('span', 'epic-tl-year');
      year.textContent = p.year;
      const title = el('span', 'epic-tl-title');
      title.textContent = p.title;
      const loc = el('span', 'epic-tl-loc');
      loc.textContent = p.location;
      head.append(year, title, loc);

      // 简介
      const brief = el('div', 'epic-tl-brief');
      brief.textContent = p.brief;

      // 详情（展开后显示历史背景）
      const detail = el('div', 'epic-tl-detail');
      const dl = el('div', 'dt-label');
      dl.textContent = '时代背景';
      const dt = el('div', 'dt-text');
      dt.textContent = p.bgDesc;
      detail.append(dl, dt);

      // 圆点
      const dot = el('div', 'epic-tl-dot');

      item.append(dot, head, brief, detail);
      item.addEventListener('click', () => {
        // 手风琴：仅当前展开
        this.tlItems.forEach((it) => it.classList.remove('active'));
        item.classList.add('active');
        onSelect(i);
      });
      this.tlList.appendChild(item);
      this.tlItems.push(item);
    });
  }

  /** 滚动进入视口时逐条显现（由页面滚动监听调用） */
  revealTimelineItems() {
    if (!this.tlItems) return;
    const vh = window.innerHeight;
    this.tlItems.forEach((it: HTMLElement, i: number) => {
      const rect = it.getBoundingClientRect();
      if (rect.top < vh * 0.92 && rect.bottom > 0) {
        setTimeout(() => it.classList.add('reveal'), Math.min(i % 6, 5) * 70);
      }
    });
  }

  /* ============================================================
   * 各阶段显隐控制
   * ============================================================ */

  setPhase(n: number) {
    this.phase = n;
    if (n >= 2) this.phaseRail.classList.add('visible');
    this.phaseItems.forEach((item, idx) => {
      item.classList.toggle('active', PHASES[idx].id === n);
    });
  }

  showIntro() {
    this.intro.classList.remove('hidden');
    this.barTop.classList.add('show');
    this.barBottom.classList.add('show');
  }
  hideIntro() {
    this.intro.classList.add('hidden');
  }

  showGazeHint() {
    this.gaze.classList.remove('visible');
    // 重新触发动画
    void this.gaze.offsetWidth;
    this.gaze.classList.add('visible');
  }

  showLoading(text: string) {
    this.loadingText.textContent = text;
    this.loading.classList.add('visible');
  }
  hideLoading() {
    this.loading.classList.remove('visible');
  }

  showTravelHud() {
    this.yearBanner.classList.add('visible');
  }
  hideTravelHud() {
    this.yearBanner.classList.remove('visible');
  }

  updateTravelHud(_index: number, p: EventPoint) {
    this.ybYear.textContent = p.year;
    this.ybTitle.textContent = p.title;
  }

  showEventCard(p: EventPoint, index: number) {
    this.cardIndex.textContent = `第 ${String(index + 1).padStart(2, '0')} 站 / 共 ${this.total || ''}`;
    this.cardYear.textContent = p.year;
    this.cardLoc.textContent = p.location;
    this.cardTitle.textContent = p.title;
    this.cardBrief.textContent = p.brief;
    this.card.classList.add('visible');
    this.yearBanner.classList.add('visible');
  }
  hideEventCard() {
    this.card.classList.remove('visible');
    this.yearBanner.classList.remove('visible');
  }

  /** 切换时代氛围背景（用径向渐变 + 主色模拟时代画面基调） */
  setAmbient(hue: AmbientHue, p: Partial<EventPoint>) {
    const { r, g, b } = hue;
    const c1 = `rgba(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0}, 0.55)`;
    const c2 = `rgba(${(r * 255 * 0.4) | 0}, ${(g * 255 * 0.4) | 0}, ${(b * 255 * 0.5) | 0}, 0.28)`;
    // 用两团光晕 + 底部渐隐构建氛围
    this.ambient.style.background = `
      radial-gradient(ellipse 70% 55% at 22% 28%, ${c1} 0%, rgba(0,0,0,0) 62%),
      radial-gradient(ellipse 60% 50% at 80% 74%, ${c2} 0%, rgba(0,0,0,0) 60%)
    `;
    // 同时轻微调整 3D 底色的情感基调
    this.ambient.dataset.desc = (p && p.bgDesc) || '';
  }

  showFinaleTitle() {
    this.finale.classList.add('visible');
  }
  hideFinaleTitle() {
    this.finale.classList.remove('visible');
  }

  showUnlockHint() {
    this.unlock.classList.add('visible');
    this.skipBtn.classList.add('hidden');
    // 4 秒后淡出解锁提示
    setTimeout(() => this.unlock.classList.remove('visible'), 7000);
  }

  showHoverTip(p: EventPoint, x: number, y: number) {
    this.hoverTip.innerHTML = `<span class="ht-year">${p.year}</span>${p.title}`;
    this.hoverTip.style.left = `${x}px`;
    this.hoverTip.style.top = `${y}px`;
    this.hoverTip.classList.add('visible');
  }
  hideHoverTip() {
    this.hoverTip.classList.remove('visible');
  }

  setTotal(n: number) {
    this.total = n;
  }

  hideSkip() {
    this.skipBtn.classList.add('hidden');
  }

  /* ---------- 阶段 6：展开时间轴 ---------- */
  openTimeline(stageEl?: HTMLElement | null) {
    this.timelineOpen = true;
    this.timeline.classList.add('open');
    if (stageEl) stageEl.classList.add('shrunk');
  }
  closeTimeline(stageEl?: HTMLElement | null) {
    this.timelineOpen = false;
    this.timeline.classList.remove('open');
    if (stageEl) stageEl.classList.remove('shrunk');
  }
}

/* ============================================================
 * 工具：创建元素（泛型返回，保证类型精确）
 * ============================================================ */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

/* ============================================================
 * 青年毛泽东 · 远眺山河 SVG 肖像（占位素材）
 * ------------------------------------------------------------
 * 说明：此为"占位插画"，用矢量线面刻画一位青年侧身远眺的剪影，
 *       后续可直接替换为真实历史照片（见文件底部替换说明）。
 * ============================================================ */
export const YOUTH_MAO_SVG = /* html */ `
<svg viewBox="0 0 380 520" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="skill" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#3a1012"/>
      <stop offset="45%" stop-color="#1c0709"/>
      <stop offset="100%" stop-color="#0a0405"/>
    </linearGradient>
    <linearGradient id="rimlight" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0%" stop-color="#f7e2a0" stop-opacity="0"/>
      <stop offset="55%" stop-color="#e8c86a" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#f7e2a0" stop-opacity="0.15"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0%" stop-color="#c41e20" stop-opacity="0.5"/>
      <stop offset="55%" stop-color="#7a1418" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.1"/></filter>
  </defs>

  <!-- 背景光晕 -->
  <ellipse cx="190" cy="230" rx="180" ry="230" fill="url(#halo)"/>

  <!-- 远山（他远眺的山河轮廓） -->
  <g opacity="0.5">
    <path d="M0 400 L60 350 L110 385 L160 330 L215 378 L270 322 L330 372 L380 340 L380 520 L0 520 Z"
          fill="#140507" opacity="0.85"/>
    <path d="M0 430 L70 392 L130 420 L195 375 L255 412 L320 368 L380 400 L380 520 L0 520 Z"
          fill="#0b0304" opacity="0.9"/>
  </g>

  <!-- 人物主体：青年侧身远眺剪影 -->
  <g transform="translate(190,300)">
    <!-- 身躯/长衫 -->
    <path d="M-58 210
             C-70 150 -62 92 -44 58
             C-34 38 -14 26 6 26
             C28 26 46 40 52 64
             C64 106 70 160 62 210 Z"
          fill="url(#skill)" stroke="url(#rimlight)" stroke-width="1.6"/>
    <!-- 肩部/衣领 -->
    <path d="M-44 60 C-24 40 4 34 40 52 C50 58 54 66 52 74 C30 62 -18 64 -48 78 Z"
          fill="#160407" opacity="0.9"/>
    <!-- 头部 -->
    <path d="M8 20
             C-14 20 -28 4 -28 -18
             C-28 -44 -12 -60 10 -60
             C32 -60 46 -44 46 -20
             C46 6 32 20 8 20 Z"
          transform="translate(6,-24)"
          fill="url(#skill)" stroke="url(#rimlight)" stroke-width="1.5"/>
    <!-- 发型（青年短发，向后梳） -->
    <path d="M-24 -70 C-14 -92 20 -96 40 -82 C50 -75 52 -64 48 -56 C36 -70 6 -74 -12 -64 Z"
          transform="translate(6,-24)"
          fill="#0d0304" stroke="#e8c86a" stroke-width="0.8" opacity="0.95"/>
    <!-- 面部轮廓高光（侧脸远眺） -->
    <path d="M14 -52 C24 -50 28 -40 26 -30 C25 -24 22 -20 18 -18"
          transform="translate(6,-24)"
          fill="none" stroke="#e8c86a" stroke-width="1" opacity="0.55" filter="url(#soft)"/>
    <!-- 手臂：手指向远方 -->
    <path d="M44 46 C74 34 104 22 128 16"
          fill="none" stroke="url(#rimlight)" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
    <path d="M60 60 C88 52 112 44 132 40"
          fill="none" stroke="#160407" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
  </g>

  <!-- 前景光尘 -->
  <g opacity="0.6">
    <circle cx="96" cy="150" r="2.4" fill="#f7e2a0"/>
    <circle cx="288" cy="196" r="1.8" fill="#e8c86a"/>
    <circle cx="70" cy="300" r="1.6" fill="#f7e2a0"/>
    <circle cx="312" cy="330" r="2.2" fill="#e8c86a"/>
    <circle cx="150" cy="90" r="1.4" fill="#f7e2a0"/>
  </g>
</svg>
`;

/* ------------------------------------------------------------
 * 【替换真实历史图片的方法】
 * 将上面的 `portrait.innerHTML = YOUTH_MAO_SVG;` 改为：
 *   portrait.innerHTML = '<img src="/images/youth-mao.jpg" alt="青年毛泽东" />';
 * 并在 public/images/ 下放入历史照片即可。
 * CSS 中 .epic-portrait img 需补充 width/height:100%; object-fit:cover;
 * ------------------------------------------------------------ */
