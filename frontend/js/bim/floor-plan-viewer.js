/**
 * Professional architectural 2D floor plan renderer from BIM model snapshot.
 * World coordinates (meters) → viewport transform → screen coordinates.
 */
export class FloorPlanViewer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      units: options.units || 'imperial', // 'imperial' | 'metric'
      onSelect: options.onSelect || (() => {}),
      projectId: options.projectId || '',
      projectName: options.projectName || '',
      ...options,
    };

    this.model = null;
    this.currentStoreyId = null;
    this.selectedId = null;

    // Viewport: zoom & pan on top of fit transform
    this.fitScale = 1;
    this.fitOffsetX = 0;
    this.fitOffsetY = 0;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPointer = null;

    this.bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 };

    this.layers = {
      walls: true,
      rooms: true,
      doors: true,
      windows: true,
      stairs: true,
      dimensions: true,
      furniture: false,
      landscape: true,
      structure: true,
      mep: false,
      grid: false,
    };

    this.wallMap = new Map();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fp-canvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'grab';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('mouseup', () => this.onPointerUp());
    this.canvas.addEventListener('mouseleave', () => this.onPointerUp());
    this.canvas.addEventListener('click', (e) => this.onClick(e));

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(container);
  }

  /* ── Model loading ─────────────────────────────────────────── */

  loadModel(model, { storeyId } = {}) {
    this.model = model;
    this.wallMap.clear();
    for (const el of model?.elements || []) {
      if (el.type === 'Wall') this.wallMap.set(el.id, el);
    }
    const storeys = this.getStoreys();
    if (storeyId) {
      this.currentStoreyId = storeyId;
    } else if (storeys.length) {
      this.currentStoreyId = storeys[0].id;
    }
    this.fitToScreen();
    this.draw();
  }

  getStoreys() {
    return (this.model?.elements || [])
      .filter((e) => e.type === 'BuildingStorey')
      .sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0));
  }

  setStorey(storeyId) {
    this.currentStoreyId = storeyId;
    this.selectedId = null;
    this.fitToScreen();
    this.draw();
  }

  setLayer(name, visible) {
    if (name in this.layers) {
      this.layers[name] = visible;
      this.draw();
    }
  }

  toggleLayer(name) {
    if (name in this.layers) {
      this.layers[name] = !this.layers[name];
      this.draw();
    }
  }

  getElementsForStorey() {
    const els = this.model?.elements || [];
    if (!this.currentStoreyId) return els;
    const sid = this.currentStoreyId;
    const storeyIdx = this.getStoreys().find((s) => s.id === sid)?.properties?.index ?? 0;
    return els.filter((el) => {
      if (['Site', 'Building'].includes(el.type)) return true;
      if (el.type === 'BuildingStorey') return el.id === sid;
      if (el.geometry?.kind === 'landscape' || el.properties?.zone === 'garden') {
        return storeyIdx === 0;
      }
      if (el.properties?.zone === 'parking') return storeyIdx === 0;
      return el.storeyId === sid || el.storeyId === null;
    });
  }

  /* ── Viewport transform ────────────────────────────────────── */

  get scale() {
    return this.fitScale * this.zoom;
  }

  worldToScreen(x, y) {
    return {
      x: x * this.scale + this.fitOffsetX + this.panX,
      y: y * this.scale + this.fitOffsetY + this.panY,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.fitOffsetX - this.panX) / this.scale,
      y: (sy - this.fitOffsetY - this.panY) / this.scale,
    };
  }

  computeBounds() {
    const els = this.getElementsForStorey();
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    const expand = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    // Always fit the full plot boundary first
    const plotL = this.model?.site?.plotLengthM;
    const plotW = this.model?.site?.plotWidthM;
    if (plotL && plotW) {
      expand(0, 0);
      expand(plotL, plotW);
    }

    for (const el of els) {
      if (el.type === 'Building' && el.geometry?.footprint) {
        const ox = el.position?.x ?? el.geometry.origin?.x ?? 0;
        const oy = el.position?.y ?? el.geometry.origin?.y ?? 0;
        const l = el.dimensions?.lengthM ?? el.geometry.lengthM ?? 0;
        const w = el.dimensions?.widthM ?? el.geometry.widthM ?? 0;
        expand(ox, oy);
        expand(ox + l, oy + w);
      }
      if (el.geometry?.kind === 'plot' && el.geometry.boundary) {
        for (const p of el.geometry.boundary) expand(p[0], p[1]);
      }
      if (el.geometry?.kind === 'landscape' && el.geometry.boundary) {
        for (const p of el.geometry.boundary) expand(p[0], p[1]);
      }
      if (el.type === 'Wall' && el.geometry?.startPoint) {
        const t = (el.dimensions?.thicknessM || 0.23) / 2;
        expand(el.geometry.startPoint.x - t, el.geometry.startPoint.y - t);
        expand(el.geometry.endPoint.x + t, el.geometry.endPoint.y + t);
      }
      if (el.type === 'Room') {
        const ox = el.position?.x || 0;
        const oy = el.position?.y || 0;
        expand(ox, oy);
        expand(ox + (el.dimensions?.lengthM || 0), oy + (el.dimensions?.widthM || 0));
      }
      if (el.type === 'Slab' && el.geometry?.boundary) {
        for (const p of el.geometry.boundary) {
          const x = Array.isArray(p) ? p[0] : p.x;
          const y = Array.isArray(p) ? p[1] : p.y;
          expand(x, y);
        }
      }
    }

    if (!Number.isFinite(minX)) {
      minX = 0; minY = 0; maxX = 15; maxY = 12;
    }

    const dimMargin = this.layers.dimensions ? 1.8 : 0.4;
    this.bounds = {
      minX: minX - dimMargin,
      minY: minY - dimMargin,
      maxX: maxX + dimMargin,
      maxY: maxY + dimMargin,
    };
  }

  fitToScreen() {
    if (!this.model) return;
    this.computeBounds();
    const { minX, minY, maxX, maxY } = this.bounds;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    // Target 78% of viewport for drawing content
    const padX = w * 0.11;
    const padY = h * 0.11;
    this.fitScale = Math.min((w - padX * 2) / rangeX, (h - padY * 2) / rangeY);
    this.fitOffsetX = (w - rangeX * this.fitScale) / 2 - minX * this.fitScale;
    this.fitOffsetY = (h - rangeY * this.fitScale) / 2 - minY * this.fitScale;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  zoomIn() { this.zoom = Math.min(8, this.zoom * 1.25); this.draw(); }
  zoomOut() { this.zoom = Math.max(0.2, this.zoom / 1.25); this.draw(); }
  resetView() { this.fitToScreen(); this.draw(); }

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = this.screenToWorld(sx, sy);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoom = Math.min(8, Math.max(0.2, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.panX += (after.x - before.x) * this.scale;
    this.panY += (after.y - before.y) * this.scale;
    this.draw();
  }

  onPointerDown(e) {
    if (e.button !== 0) return;
    this.isPanning = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.canvas.style.cursor = 'grabbing';
  }

  onPointerMove(e) {
    if (!this.isPanning || !this.lastPointer) return;
    this.panX += e.clientX - this.lastPointer.x;
    this.panY += e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.draw();
  }

  onPointerUp() {
    this.isPanning = false;
    this.lastPointer = null;
    this.canvas.style.cursor = 'grab';
  }

  onClick(e) {
    if (!this.model) return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = this.hitTest(sx, sy);
    this.selectedId = hit?.id || null;
    this.options.onSelect(hit);
    this.draw();
  }

  hitTest(sx, sy) {
    const { x, y } = this.screenToWorld(sx, sy);
    const els = this.getElementsForStorey();
    const tol = 0.35 / this.scale;

    // Rooms first
    for (const el of els.filter((e) => e.type === 'Room')) {
      const ox = el.position?.x || 0;
      const oy = el.position?.y || 0;
      const l = el.dimensions?.lengthM || 0;
      const w = el.dimensions?.widthM || 0;
      if (x >= ox && x <= ox + l && y >= oy && y <= oy + w) return el;
    }

    // Doors / windows
    for (const el of els.filter((e) => e.type === 'Door' || e.type === 'Window')) {
      const pos = this.getOpeningPosition(el);
      if (!pos) continue;
      if (Math.hypot(x - pos.cx, y - pos.cy) < (el.dimensions?.widthM || 1) / 2 + tol) return el;
    }

    // Walls
    for (const el of els.filter((e) => e.type === 'Wall')) {
      const sp = el.geometry?.startPoint;
      const ep = el.geometry?.endPoint;
      if (!sp || !ep) continue;
      const dist = this.pointToSegmentDist(x, y, sp.x, sp.y, ep.x, ep.y);
      const halfT = (el.dimensions?.thicknessM || 0.23) / 2 + tol;
      if (dist <= halfT) return el;
    }

    return null;
  }

  pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /* ── Unit formatting ───────────────────────────────────────── */

  formatLength(m) {
    if (this.options.units === 'metric') {
      if (m >= 1) return `${m.toFixed(2)} m`;
      return `${Math.round(m * 1000)} mm`;
    }
    const ft = m / 0.3048;
    const feet = Math.floor(ft);
    const inches = Math.round((ft - feet) * 12);
    if (inches === 0) return `${feet}'-0"`;
    if (inches === 12) return `${feet + 1}'-0"`;
    return `${feet}'-${inches}"`;
  }

  formatArea(m2) {
    if (this.options.units === 'metric') return `${m2.toFixed(2)} m²`;
    return `${Math.round(m2 * 10.7639)} sq.ft.`;
  }

  formatDimLine(m) {
    if (this.options.units === 'metric') {
      if (m >= 1) return `${m.toFixed(2)}`;
      return `${Math.round(m * 1000)}`;
    }
    const ft = m / 0.3048;
    const feet = Math.floor(ft);
    const inches = Math.round((ft - feet) * 12);
    if (inches === 0) return `${feet}'-0"`;
    if (inches === 12) return `${feet + 1}'-0"`;
    return `${feet}'-${inches}"`;
  }

  dimUnitSuffix() {
    return this.options.units === 'metric' ? 'm' : '';
  }

  /* ── Geometry helpers ────────────────────────────────────────── */

  wallPolygon(wall) {
    const sp = wall.geometry?.startPoint;
    const ep = wall.geometry?.endPoint;
    if (!sp || !ep) return null;
    const t = (wall.dimensions?.thicknessM || 0.23) / 2;
    const dx = ep.x - sp.x;
    const dy = ep.y - sp.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return null;
    const nx = (-dy / len) * t;
    const ny = (dx / len) * t;
    return [
      { x: sp.x + nx, y: sp.y + ny },
      { x: ep.x + nx, y: ep.y + ny },
      { x: ep.x - nx, y: ep.y - ny },
      { x: sp.x - nx, y: sp.y - ny },
    ];
  }

  getOpeningPosition(opening) {
    const hostId = opening.geometry?.hostWallId;
    const wall = hostId ? this.wallMap.get(hostId) : null;
    if (wall?.geometry?.startPoint) {
      const sp = wall.geometry.startPoint;
      const ep = wall.geometry.endPoint;
      const t = opening.geometry?.positionOnWall ?? 0.5;
      const angle = Math.atan2(ep.y - sp.y, ep.x - sp.x);
      return {
        cx: sp.x + (ep.x - sp.x) * t,
        cy: sp.y + (ep.y - sp.y) * t,
        angle,
        wall,
      };
    }
    const pos = opening.position || { x: 0, y: 0 };
    return { cx: pos.x, cy: pos.y, angle: 0, wall: null };
  }

  isExteriorWall(wall) {
    if (wall.properties?.exterior) return true;
    if (wall.properties?.interior) return false;
    return /exterior/i.test(wall.name || '');
  }

  drawPolygon(points, { fill, stroke, lineWidth = 1 }) {
    if (!points?.length) return;
    const ctx = this.ctx;
    const p0 = this.worldToScreen(points[0].x, points[0].y);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.worldToScreen(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  /* ── Main draw pipeline ────────────────────────────────────── */

  draw() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, w, h);

    if (!this.model) return;

    // Paper background
    this.ctx.fillStyle = '#f4f1ea';
    this.ctx.fillRect(0, 0, w, h);

    const els = this.getElementsForStorey();

    if (this.layers.grid) this.drawGrid(w, h);
    if (this.layers.landscape) {
      this.drawSetbacks();
      this.drawSite(els);
    }
    if (this.layers.rooms) this.drawRoomFills(els);
    if (this.layers.structure || this.layers.walls) this.drawWalls(els);
    if (this.layers.doors) this.drawDoors(els);
    if (this.layers.windows) this.drawWindows(els);
    if (this.layers.stairs) this.drawStairs(els);
    if (this.layers.furniture) this.drawFurniture(els);
    if (this.layers.dimensions) this.drawDimensions(els);
    if (this.layers.rooms) this.drawRoomLabels(els);
    this.drawNorthArrow(w, h);
    this.drawScaleBar(w, h);
    this.drawSelectionHighlight(els);
  }

  drawGrid(w, h) {
    const ctx = this.ctx;
    const step = this.options.units === 'metric' ? 1 : 0.3048; // 1m or 1ft
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(w, h);
    const startX = Math.floor(tl.x / step) * step;
    const startY = Math.floor(tl.y / step) * step;
    ctx.strokeStyle = 'rgba(180,170,150,0.35)';
    ctx.lineWidth = 0.5;
    for (let x = startX; x <= br.x; x += step) {
      const p1 = this.worldToScreen(x, tl.y);
      const p2 = this.worldToScreen(x, br.y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let y = startY; y <= br.y; y += step) {
      const p1 = this.worldToScreen(tl.x, y);
      const p2 = this.worldToScreen(br.x, y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  drawSetbacks() {
    const site = this.model?.site;
    const plotL = site?.plotLengthM;
    const plotW = site?.plotWidthM;
    const buildable = site?.buildable;
    if (!plotL || !plotW || !buildable) return;

    const outer = [
      { x: 0, y: 0 }, { x: plotL, y: 0 }, { x: plotL, y: plotW }, { x: 0, y: plotW },
    ];
    this.drawPolygon(outer, { fill: 'rgba(200,180,150,0.1)', stroke: '#c0392b', lineWidth: 2 });

    const inner = [
      { x: buildable.x, y: buildable.y },
      { x: buildable.x + buildable.width, y: buildable.y },
      { x: buildable.x + buildable.width, y: buildable.y + buildable.height },
      { x: buildable.x, y: buildable.y + buildable.height },
    ];
    this.drawPolygon(inner, { fill: 'rgba(255,255,255,0.12)', stroke: 'rgba(180,160,140,0.55)', lineWidth: 1 });
  }

  drawSite(els) {
    const ctx = this.ctx;
    for (const el of els) {
      if (el.geometry?.kind === 'landscape' && el.geometry.boundary) {
        const b = el.geometry.boundary;
        const pts = b.map((p) => ({ x: p[0], y: p[1] }));
        this.drawPolygon(pts, { fill: 'rgba(120,160,90,0.22)', stroke: '#5a7a4a', lineWidth: 1 });
        const cx = b.reduce((s, p) => s + p[0], 0) / b.length;
        const cy = b.reduce((s, p) => s + p[1], 0) / b.length;
        const cp = this.worldToScreen(cx, cy);
        ctx.font = '600 10px "Space Grotesk", sans-serif';
        ctx.fillStyle = '#4a6a3a';
        ctx.textAlign = 'center';
        ctx.fillText('GARDEN', cp.x, cp.y);
      }
      if (el.properties?.zone === 'parking' || el.properties?.roomType === 'parking') {
        const ox = el.position?.x || 0;
        const oy = el.position?.y || 0;
        const l = el.dimensions?.lengthM || 0;
        const w = el.dimensions?.widthM || 0;
        const pts = [
          { x: ox, y: oy }, { x: ox + l, y: oy },
          { x: ox + l, y: oy + w }, { x: ox, y: oy + w },
        ];
        this.drawPolygon(pts, { fill: 'rgba(120,120,130,0.25)', stroke: '#666', lineWidth: 1 });
        const cp = this.worldToScreen(ox + l / 2, oy + w / 2);
        ctx.font = '600 9px "Space Grotesk", sans-serif';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.fillText('PARKING', cp.x, cp.y);
      }
    }
  }

  drawRoomFills(els) {
    for (const el of els) {
      if (el.type !== 'Room') continue;
      if (el.properties?.zone === 'parking' || el.properties?.roomType === 'garden') continue;
      if (el.geometry?.kind === 'landscape') continue;
      const ox = el.position?.x || 0;
      const oy = el.position?.y || 0;
      const l = el.dimensions?.lengthM || 0;
      const w = el.dimensions?.widthM || 0;
      const pts = [
        { x: ox, y: oy },
        { x: ox + l, y: oy },
        { x: ox + l, y: oy + w },
        { x: ox, y: oy + w },
      ];
      const isSelected = el.id === this.selectedId;
      this.drawPolygon(pts, {
        fill: isSelected ? 'rgba(255,212,0,0.12)' : 'rgba(255,255,255,0.55)',
        stroke: isSelected ? '#c9a800' : 'rgba(200,190,170,0.3)',
        lineWidth: isSelected ? 1.5 : 0.5,
      });
    }
  }

  drawWalls(els) {
    const ctx = this.ctx;
    for (const el of els) {
      if (el.type !== 'Wall' || !el.geometry?.startPoint) continue;
      const poly = this.wallPolygon(el);
      if (!poly) continue;
      const exterior = this.isExteriorWall(el);
      const isSelected = el.id === this.selectedId;
      this.drawPolygon(poly, {
        fill: isSelected ? '#3a3a3a' : (exterior ? '#1a1a1a' : '#4a4a4a'),
        stroke: isSelected ? '#c9a800' : (exterior ? '#0a0a0a' : '#333'),
        lineWidth: exterior ? 1.2 : 0.8,
      });
    }
  }

  drawDoors(els) {
    const ctx = this.ctx;
    for (const el of els) {
      if (el.type !== 'Door') continue;
      const pos = this.getOpeningPosition(el);
      if (!pos) continue;
      const widthM = el.dimensions?.widthM || 0.9;
      const halfW = widthM / 2;
      const { cx, cy, angle } = pos;
      const isSelected = el.id === this.selectedId;

      // Opening gap in wall (white line)
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x1 = cx - halfW * cos;
      const y1 = cy - halfW * sin;
      const x2 = cx + halfW * cos;
      const y2 = cy + halfW * sin;
      const p1 = this.worldToScreen(x1, y1);
      const p2 = this.worldToScreen(x2, y2);
      ctx.strokeStyle = '#f4f1ea';
      ctx.lineWidth = Math.max(3, (pos.wall?.dimensions?.thicknessM || 0.23) * this.scale * 1.1);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Door leaf
      const leafLen = widthM * 0.95;
      const hingeX = x1;
      const hingeY = y1;
      const leafEndX = hingeX + leafLen * Math.cos(angle + Math.PI / 2);
      const leafEndY = hingeY + leafLen * Math.sin(angle + Math.PI / 2);
      const hp = this.worldToScreen(hingeX, hingeY);
      const lp = this.worldToScreen(leafEndX, leafEndY);

      ctx.strokeStyle = isSelected ? '#c9a800' : '#5c3d1e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hp.x, hp.y);
      ctx.lineTo(lp.x, lp.y);
      ctx.stroke();

      // Swing arc
      const arcR = leafLen * this.scale;
      ctx.strokeStyle = isSelected ? 'rgba(201,168,0,0.7)' : 'rgba(92,61,30,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const startAngle = angle + Math.PI / 2;
      ctx.arc(hp.x, hp.y, arcR, startAngle, startAngle + Math.PI / 2);
      ctx.stroke();
    }
  }

  drawWindows(els) {
    const ctx = this.ctx;
    for (const el of els) {
      if (el.type !== 'Window') continue;
      const pos = this.getOpeningPosition(el);
      if (!pos) continue;
      const widthM = el.dimensions?.widthM || 1.2;
      const halfW = widthM / 2;
      const { cx, cy, angle } = pos;
      const isSelected = el.id === this.selectedId;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const x1 = cx - halfW * cos;
      const y1 = cy - halfW * sin;
      const x2 = cx + halfW * cos;
      const y2 = cy + halfW * sin;
      const p1 = this.worldToScreen(x1, y1);
      const p2 = this.worldToScreen(x2, y2);

      // Wall break
      ctx.strokeStyle = '#f4f1ea';
      ctx.lineWidth = Math.max(2.5, (pos.wall?.dimensions?.thicknessM || 0.23) * this.scale);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Window symbol — parallel lines across opening
      const perpX = -sin * 3;
      const perpY = cos * 3;
      ctx.strokeStyle = isSelected ? '#c9a800' : '#2563a8';
      ctx.lineWidth = 1.2;
      for (const t of [0.25, 0.5, 0.75]) {
        const mx = p1.x + (p2.x - p1.x) * t;
        const my = p1.y + (p2.y - p1.y) * t;
        ctx.beginPath();
        ctx.moveTo(mx + perpX, my + perpY);
        ctx.lineTo(mx - perpX, my - perpY);
        ctx.stroke();
      }
      // Outer frame
      ctx.strokeStyle = isSelected ? '#c9a800' : '#1e4a7a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  drawStairs(els) {
    const ctx = this.ctx;
    for (const el of els.filter((e) => e.type === 'Stair')) {
      const ox = el.position?.x || 0;
      const oy = el.position?.y || 0;
      const l = el.dimensions?.lengthM || 2;
      const w = el.dimensions?.widthM || 1;
      const p1 = this.worldToScreen(ox, oy);
      const p2 = this.worldToScreen(ox + l, oy + w);
      ctx.fillStyle = 'rgba(200,190,170,0.4)';
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(3, Math.floor(l / 0.28));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const wx = ox + l * t;
        const a = this.worldToScreen(wx, oy);
        const b = this.worldToScreen(wx, oy + w);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const cp = this.worldToScreen(ox + l / 2, oy + w / 2);
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.fillText('↑ UP', cp.x, cp.y + 4);
    }
  }

  drawFurniture(els) {
    const ctx = this.ctx;
    for (const el of els.filter((e) => ['Furniture', 'Fixture'].includes(e.type))) {
      const ox = el.position?.x || 0;
      const oy = el.position?.y || 0;
      const l = el.dimensions?.lengthM || 1;
      const w = el.dimensions?.widthM || 0.6;
      const p1 = this.worldToScreen(ox, oy);
      const p2 = this.worldToScreen(ox + l, oy + w);
      ctx.fillStyle = 'rgba(150,130,100,0.25)';
      ctx.strokeStyle = 'rgba(100,80,60,0.5)';
      ctx.lineWidth = 0.8;
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }
  }

  drawDimensions(els) {
    const plot = els.find((e) => e.geometry?.kind === 'plot');
    const building = els.find((e) => e.type === 'Building');

    if (plot?.geometry?.boundary) {
      const b = plot.geometry.boundary;
      const lenM = plot.dimensions?.lengthM || Math.abs(b[1][0] - b[0][0]);
      const widM = plot.dimensions?.widthM || Math.abs(b[2][1] - b[1][1]);
      this.drawHorizDimension(b[0][0], b[1][0], b[0][1] - 1.2, lenM, 'below');
      this.drawVertDimension(b[0][0] - 1.2, b[0][1], b[3][1], widM, 'left');
    }

    if (building) {
      const ox = building.position?.x ?? building.geometry?.origin?.x ?? 0;
      const oy = building.position?.y ?? building.geometry?.origin?.y ?? 0;
      const bl = building.dimensions?.lengthM ?? building.geometry?.lengthM ?? 0;
      const bw = building.dimensions?.widthM ?? building.geometry?.widthM ?? 0;
      this.drawHorizDimension(ox, ox + bl, oy - 0.6, bl, 'above');
      this.drawVertDimension(ox + bl + 0.6, oy, oy + bw, bw, 'right');
    }

    // Room dimensions (inside smaller rooms only)
    const rooms = els.filter((e) => e.type === 'Room');
    for (const room of rooms) {
      const l = room.dimensions?.lengthM || 0;
      const w = room.dimensions?.widthM || 0;
      if (l < 2.5 || w < 2.5) continue;
      const ox = room.position?.x || 0;
      const oy = room.position?.y || 0;
      if (l >= 3 && w >= 3) {
        this.drawHorizDimension(ox + 0.15, ox + l - 0.15, oy + 0.25, l - 0.3, 'inside-top', 0.35);
      }
    }
  }

  drawHorizDimension(x1, x2, y, lengthM, placement, offset = 0) {
    const ctx = this.ctx;
    const dimOff = placement === 'inside-top' ? 0 : 0.8;
    const yDim = y + (placement === 'below' ? dimOff : -dimOff);
    const p1 = this.worldToScreen(x1, yDim);
    const p2 = this.worldToScreen(x2, yDim);
    const pe1 = this.worldToScreen(x1, y);
    const pe2 = this.worldToScreen(x2, y);

    ctx.strokeStyle = '#444';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 0.7;
    ctx.font = `${Math.max(9, Math.min(12, 10 * this.zoom))}px "Space Grotesk", sans-serif`;

    // Extension lines
    ctx.beginPath();
    ctx.moveTo(pe1.x, pe1.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(pe2.x, pe2.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Dimension line
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Ticks
    const tick = 4;
    for (const p of [p1, p2]) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - tick);
      ctx.lineTo(p.x, p.y + tick);
      ctx.stroke();
    }

    const text = this.formatDimLine(lengthM) + (this.dimUnitSuffix() ? ` ${this.dimUnitSuffix()}` : '');
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2 - (placement === 'below' ? -12 : 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    const tw = ctx.measureText(text).width + 6;
    ctx.fillRect(mx - tw / 2, my - 8, tw, 14);
    ctx.fillStyle = '#222';
    ctx.fillText(text, mx, my + 3);
  }

  drawVertDimension(x, y1, y2, lengthM, placement) {
    const ctx = this.ctx;
    const dimOff = 0.8;
    const xDim = x + (placement === 'left' ? -dimOff : dimOff);
    const p1 = this.worldToScreen(xDim, y1);
    const p2 = this.worldToScreen(xDim, y2);
    const pe1 = this.worldToScreen(x, y1);
    const pe2 = this.worldToScreen(x, y2);

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.7;
    ctx.font = `${Math.max(9, Math.min(12, 10 * this.zoom))}px "Space Grotesk", sans-serif`;

    ctx.beginPath();
    ctx.moveTo(pe1.x, pe1.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(pe2.x, pe2.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    const tick = 4;
    for (const p of [p1, p2]) {
      ctx.beginPath();
      ctx.moveTo(p.x - tick, p.y);
      ctx.lineTo(p.x + tick, p.y);
      ctx.stroke();
    }

    const text = this.formatDimLine(lengthM) + (this.dimUnitSuffix() ? ` ${this.dimUnitSuffix()}` : '');
    const mx = (p1.x + p2.x) / 2 + (placement === 'left' ? -14 : 14);
    const my = (p1.y + p2.y) / 2;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    const tw = ctx.measureText(text).width + 6;
    ctx.fillRect(-tw / 2, -7, tw, 14);
    ctx.fillStyle = '#222';
    ctx.fillText(text, 0, 4);
    ctx.restore();
  }

  drawRoomLabels(els) {
    const rooms = els.filter((e) => e.type === 'Room');
    const placed = [];
    const ctx = this.ctx;

    // Sort by area descending — place large rooms first
    const sorted = [...rooms].sort((a, b) => {
      const aa = (a.dimensions?.lengthM || 0) * (a.dimensions?.widthM || 0);
      const bb = (b.dimensions?.lengthM || 0) * (b.dimensions?.widthM || 0);
      return bb - aa;
    });

    const seen = new Set();
    for (const room of sorted) {
      const key = `${room.name}|${Math.round((room.position?.x || 0) * 10)}|${Math.round((room.position?.y || 0) * 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ox = room.position?.x || 0;
      const oy = room.position?.y || 0;
      const l = room.dimensions?.lengthM || 0;
      const w = room.dimensions?.widthM || 0;
      const area = room.quantity?.areaM2 ?? l * w;

      const cx = ox + l / 2;
      const cy = oy + w / 2;
      const sp = this.worldToScreen(cx, cy);

      const name = (room.name || 'Room').toUpperCase();
      const dimLine = `${this.formatLength(l)} × ${this.formatLength(w)}`;
      const areaLine = this.formatArea(area);

      const minDim = Math.min(l, w) * this.scale;
      let fontSize = Math.max(9, Math.min(14, minDim / 8));
      if (minDim < 50) fontSize = 8;

      ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`;
      const nameW = ctx.measureText(name).width;
      ctx.font = `400 ${fontSize - 1}px "Space Grotesk", sans-serif`;
      const dimW = ctx.measureText(dimLine).width;
      const boxW = Math.max(nameW, dimW, ctx.measureText(areaLine).width) + 8;
      const boxH = fontSize * 3 + 6;

      let lx = sp.x - boxW / 2;
      let ly = sp.y - boxH / 2;

      // Simple overlap avoidance
      for (let attempt = 0; attempt < 6; attempt++) {
        const rect = { x: lx, y: ly, w: boxW, h: boxH };
        const overlaps = placed.some((p) => !(rect.x + rect.w < p.x || p.x + p.w < rect.x || rect.y + rect.h < p.y || p.y + p.h < rect.y));
        if (!overlaps) break;
        ly -= boxH * 0.4;
      }
      placed.push({ x: lx, y: ly, w: boxW, h: boxH });

      // Label background
      ctx.fillStyle = 'rgba(244,241,234,0.88)';
      ctx.strokeStyle = 'rgba(200,190,170,0.5)';
      ctx.lineWidth = 0.5;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(lx, ly, boxW, boxH, 3);
      } else {
        ctx.beginPath();
        ctx.rect(lx, ly, boxW, boxH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`;
      ctx.fillText(name, lx + boxW / 2, ly + fontSize + 2);
      ctx.font = `400 ${fontSize - 1}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = '#555';
      ctx.fillText(dimLine, lx + boxW / 2, ly + fontSize * 2 + 2);
      if (minDim > 60) {
        ctx.fillStyle = '#888';
        ctx.font = `400 ${fontSize - 2}px "Space Grotesk", sans-serif`;
        ctx.fillText(areaLine, lx + boxW / 2, ly + fontSize * 3);
      }
    }
  }

  drawNorthArrow(w, h) {
    const ctx = this.ctx;
    const px = w - 52;
    const py = 52;
    const facing = this.model?.site?.roadFacing || 'North';
    const rotations = { North: 0, East: Math.PI / 2, South: Math.PI, West: -Math.PI / 2 };
    const rot = rotations[facing] || 0;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.strokeStyle = '#333';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(-6, -2);
    ctx.lineTo(6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -20);
    ctx.restore();
  }

  drawScaleBar(w, h) {
    const ctx = this.ctx;
    const barM = this.options.units === 'metric' ? 2 : 0.3048 * 10; // 2m or 10ft
    const px = 24;
    const py = h - 36;
    const p1 = this.worldToScreen(0, 0);
    const p2 = this.worldToScreen(barM, 0);
    const barPx = Math.abs(p2.x - p1.x);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + barPx, py);
    ctx.moveTo(px, py - 4);
    ctx.lineTo(px, py + 4);
    ctx.moveTo(px + barPx, py - 4);
    ctx.lineTo(px + barPx, py + 4);
    ctx.stroke();

    const label = this.options.units === 'metric' ? `${barM} m` : '10 ft';
    ctx.font = '10px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.fillText(`Scale: ${label}`, px, py - 10);

    const scaleRatio = Math.round(1 / (this.scale / (window.devicePixelRatio || 1)) / 10) * 10;
    if (scaleRatio > 0 && scaleRatio < 500) {
      ctx.fillText(`≈ 1:${scaleRatio}`, px, py + 16);
    }
  }

  drawSelectionHighlight(els) {
    if (!this.selectedId) return;
    const el = els.find((e) => e.id === this.selectedId);
    if (!el) return;
    const ctx = this.ctx;
    if (el.type === 'Room') {
      const ox = el.position?.x || 0;
      const oy = el.position?.y || 0;
      const p1 = this.worldToScreen(ox, oy);
      const p2 = this.worldToScreen(ox + (el.dimensions?.lengthM || 0), oy + (el.dimensions?.widthM || 0));
      ctx.strokeStyle = '#FFD400';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.setLineDash([]);
    }
  }

  /* ── Export ────────────────────────────────────────────────── */

  exportPng(filename = 'floor-plan.png') {
    const exportCanvas = this.renderExportCanvas();
    const link = document.createElement('a');
    link.download = filename;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  exportPdf() {
    const exportCanvas = this.renderExportCanvas();
    const dataUrl = exportCanvas.toDataURL('image/png');
    const storey = this.getStoreys().find((s) => s.id === this.currentStoreyId);
    const level = storey?.name || 'Ground Floor';
    const date = new Date().toLocaleDateString('en-GB');
    const units = this.options.units === 'metric' ? 'METERS' : 'FEET / INCHES';

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Floor Plan — ${this.options.projectId}</title>
      <style>
        @page { size: A3 landscape; margin: 12mm; }
        body { margin:0; font-family: 'Space Grotesk', Arial, sans-serif; }
        .hdr { padding: 12px 16px; border-bottom: 2px solid #222; display:flex; justify-content:space-between; }
        .hdr h1 { margin:0; font-size:18px; letter-spacing:2px; }
        .hdr .meta { font-size:11px; color:#444; text-align:right; line-height:1.6; }
        img { width:100%; display:block; }
      </style></head><body>
      <div class="hdr">
        <div><h1>OH I SEE</h1><div style="font-size:12px;color:#666">RESIDENTIAL FLOOR PLAN</div></div>
        <div class="meta">
          PROJECT: ${this.options.projectId}<br>
          LEVEL: ${level}<br>
          UNITS: ${units}<br>
          DATE: ${date}
        </div>
      </div>
      <img src="${dataUrl}" alt="Floor Plan"/>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    win.document.close();
  }

  renderExportCanvas() {
    const margin = 80;
    const w = this.container.clientWidth + margin * 2;
    const h = this.container.clientHeight + margin * 2 + 60;
    const off = document.createElement('canvas');
    off.width = w * 2;
    off.height = h * 2;
    const octx = off.getContext('2d');
    octx.scale(2, 2);

    // Header
    octx.fillStyle = '#f4f1ea';
    octx.fillRect(0, 0, w, h);
    octx.fillStyle = '#1a1a1a';
    octx.font = 'bold 16px Space Grotesk, sans-serif';
    octx.fillText('OH I SEE — RESIDENTIAL FLOOR PLAN', margin, 28);
    octx.font = '11px Space Grotesk, sans-serif';
    octx.fillStyle = '#555';
    const storey = this.getStoreys().find((s) => s.id === this.currentStoreyId);
    octx.fillText(`Project: ${this.options.projectId}  |  Level: ${storey?.name || 'Ground Floor'}  |  ${new Date().toLocaleDateString('en-GB')}`, margin, 48);

    octx.drawImage(this.canvas, margin, 60, this.container.clientWidth, this.container.clientHeight);
    return off;
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.canvas.remove();
  }
}
