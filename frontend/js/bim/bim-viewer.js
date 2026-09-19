import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { materialForType, applyHomeScene, addHomeLighting } from './bim-materials.js';

const LAYER_TYPES = {
  Architecture: ['Wall', 'Door', 'Window', 'Room', 'Slab', 'BuildingStorey', 'Roof'],
  Structure: ['Column', 'Beam', 'Slab', 'Footing'],
  MEP: ['Pipe', 'Duct', 'Cable'],
  Site: ['Site', 'Building'],
};

export class BimViewer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.mode = options.mode || 'technical';
    this.model = null;
    this.meshes = new Map();
    this.hiddenTypes = new Set();
    this.selectedId = null;
    this.activeStorey = options.activeStorey ?? null;
    this.onSelect = options.onSelect || (() => {});
    this.modelGroup = new THREE.Group();
    this.defaultCamera = null;

    this.scene = new THREE.Scene();
    this.scene.add(this.modelGroup);

    if (this.mode === 'home') {
      applyHomeScene(this.scene);
    } else {
      this.scene.background = new THREE.Color(0x111111);
    }

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 800);
    this.camera.position.set(12, 10, 14);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (this.mode === 'home') applyHomeScene(this.scene, this.renderer);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = this.mode === 'home' ? Math.PI / 2.05 : Math.PI;

    if (this.mode === 'home') {
      addHomeLighting(this.scene).forEach((l) => this.scene.add(l));
    } else {
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const dir = new THREE.DirectionalLight(0xffffff, 0.85);
      dir.position.set(10, 20, 8);
      this.scene.add(dir);
      this.scene.add(new THREE.GridHelper(40, 40, 0x333333, 0x222222));
    }

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    this.resizeHandler = () => this.onResize();
    window.addEventListener('resize', this.resizeHandler);
    this.animate();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  animate() {
    this.animationFrame = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  clearMeshes() {
    while (this.modelGroup.children.length) {
      const mesh = this.modelGroup.children[0];
      this.modelGroup.remove(mesh);
      mesh.traverse?.((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      });
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material.dispose();
      }
    }
    this.meshes.clear();
  }

  // Shapes negate plan Y before the -90 degree rotation so plan Y maps to world +Z.
  boundaryPoints(boundary) {
    if (!boundary?.length) return [];
    return boundary.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }));
  }

  wallElementMap(model) {
    const map = new Map();
    for (const el of model.elements || []) {
      if (el.type === 'Wall') map.set(el.id, el);
    }
    return map;
  }

  placeOnWall(wallEl, positionOnWall, offsetNormal = 0) {
    const sp = wallEl.geometry.startPoint;
    const ep = wallEl.geometry.endPoint;
    const t = positionOnWall ?? 0.5;
    const x = sp.x + (ep.x - sp.x) * t;
    const y = sp.y + (ep.y - sp.y) * t;
    const dx = ep.x - sp.x;
    const dy = ep.y - sp.y;
    const len = Math.hypot(dx, dy) || 0.01;
    const nx = -dy / len;
    const ny = dx / len;
    return {
      x: x + nx * offsetNormal,
      y: y + ny * offsetNormal,
      rotationY: -Math.atan2(dy, dx),
    };
  }

  storeyIndexForElement(el, model) {
    if (el.properties?.storeyIndex != null) return el.properties.storeyIndex;
    if (!el.storeyId) return 0;
    const storey = (model.elements || []).find((e) => e.id === el.storeyId && e.type === 'BuildingStorey');
    return storey?.properties?.index ?? 0;
  }

  shouldRenderElement(el, model) {
    if (this.hiddenTypes.has(el.type)) return false;
    if (this.activeStorey == null) return true;
    if (['Site', 'Building', 'Roof'].includes(el.type)) return true;
    if (el.geometry?.zone === 'landscape') return this.activeStorey === 0;
    const idx = this.storeyIndexForElement(el, model);
    return idx === this.activeStorey;
  }

  loadModel(model) {
    this.model = model;
    this.clearMeshes();
    const wallMap = this.wallElementMap(model);

    const building = (model.elements || []).find((e) => e.type === 'Building');
    if (building?.geometry?.origin && this.mode === 'home') {
      const fp = building.geometry;
      const ox = fp.origin.x;
      const oy = fp.origin.y;
      const len = fp.lengthM || building.dimensions?.lengthM || 4;
      const wid = fp.widthM || building.dimensions?.widthM || 4;
      const foundationShape = new THREE.Shape();
      foundationShape.moveTo(ox, -oy);
      foundationShape.lineTo(ox + len, -oy);
      foundationShape.lineTo(ox + len, -(oy + wid));
      foundationShape.lineTo(ox, -(oy + wid));
      foundationShape.closePath();
      const fGeom = new THREE.ExtrudeGeometry(foundationShape, { depth: 0.25, bevelEnabled: false });
      fGeom.rotateX(-Math.PI / 2);
      const foundation = new THREE.Mesh(fGeom, materialForType('Slab', this.mode));
      foundation.position.y = -0.25;
      foundation.receiveShadow = true;
      this.modelGroup.add(foundation);
    }

    for (const el of model.elements || []) {
      if (!this.shouldRenderElement(el, model)) continue;
      const mesh = this.elementToMesh(el, wallMap);
      if (mesh) {
        mesh.userData.elementId = el.id;
        mesh.userData.element = el;
        this.modelGroup.add(mesh);
        this.meshes.set(el.id, mesh);
      }
    }

    this.fitCamera(this.modelGroup);
  }

  elementToMesh(el, wallMap) {
    const mat = materialForType(el.type, this.mode);

    if (el.type === 'Wall' && el.geometry?.startPoint && el.geometry?.endPoint) {
      const sp = el.geometry.startPoint;
      const ep = el.geometry.endPoint;
      const height = el.dimensions?.heightM || el.geometry.heightM || 3;
      const thick = el.dimensions?.thicknessM || el.geometry.thicknessM || 0.23;
      const elev = el.position?.z || 0;
      const dx = ep.x - sp.x;
      const dy = ep.y - sp.y;
      const len = Math.hypot(dx, dy) || 0.01;
      const geom = new THREE.BoxGeometry(len, height, thick);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set((sp.x + ep.x) / 2, elev + height / 2, (sp.y + ep.y) / 2);
      mesh.rotation.y = -Math.atan2(dy, dx);
      mesh.castShadow = this.mode === 'home';
      mesh.receiveShadow = true;
      return mesh;
    }

    if (el.type === 'Door') {
      const hostId = el.geometry?.hostWallId;
      const host = hostId ? wallMap.get(hostId) : null;
      const w = el.dimensions?.widthM || el.geometry?.widthM || 1;
      const h = el.dimensions?.heightM || el.geometry?.heightM || 2.1;
      const elev = el.position?.z || 0;
      const geom = new THREE.BoxGeometry(w, h, 0.1);
      const mesh = new THREE.Mesh(geom, mat);
      if (host) {
        const placed = this.placeOnWall(host, el.geometry?.positionOnWall ?? 0.5, 0.05);
        mesh.position.set(placed.x, elev + h / 2, placed.y);
        mesh.rotation.y = placed.rotationY;
      } else {
        mesh.position.set(el.position?.x || 0, elev + h / 2, el.position?.y || 0);
      }
      mesh.castShadow = true;
      return mesh;
    }

    if (el.type === 'Window') {
      const hostId = el.geometry?.hostWallId;
      const host = hostId ? wallMap.get(hostId) : null;
      const w = el.dimensions?.widthM || 1.2;
      const h = el.dimensions?.heightM || 1.2;
      const sill = el.dimensions?.sillHeightM || el.geometry?.sillHeightM || 0.9;
      const elev = el.position?.z || 0;
      const geom = new THREE.BoxGeometry(w, h, 0.08);
      const mesh = new THREE.Mesh(geom, materialForType('Window', this.mode));
      if (host) {
        const placed = this.placeOnWall(host, el.geometry?.positionOnWall ?? 0.5, 0.06);
        mesh.position.set(placed.x, elev + sill + h / 2, placed.y);
        mesh.rotation.y = placed.rotationY;
      } else {
        mesh.position.set(el.position?.x || 0, elev + sill + h / 2, el.position?.y || 0);
      }
      return mesh;
    }

    if (el.type === 'Slab' && el.geometry?.boundary) {
      const pts = this.boundaryPoints(el.geometry.boundary);
      if (pts.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(pts[0].x, -pts[0].y);
        for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].y);
        shape.closePath();
        const thick = el.dimensions?.thicknessM || el.geometry.thicknessM || 0.15;
        const geom = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = (el.position?.z || 0);
        mesh.receiveShadow = true;
        return mesh;
      }
    }

    if (el.type === 'Roof' && el.geometry?.boundary) {
      const pts = this.boundaryPoints(el.geometry.boundary);
      if (pts.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(pts[0].x, -pts[0].y);
        for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].y);
        shape.closePath();
        const thick = el.dimensions?.thicknessM || el.geometry.thicknessM || 0.2;
        const geom = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geom, materialForType('Roof', this.mode));
        mesh.position.y = el.position?.z || 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
      }
    }

    if (el.type === 'Room') {
      const elev = el.position?.z || 0;
      if (el.geometry?.kind === 'landscape' && el.geometry.boundary) {
        const pts = this.boundaryPoints(el.geometry.boundary);
        if (pts.length >= 3) {
          const shape = new THREE.Shape();
          shape.moveTo(pts[0].x, -pts[0].y);
          for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].y);
          shape.closePath();
          const geom = new THREE.ShapeGeometry(shape);
          const mesh = new THREE.Mesh(geom, materialForType('Site', this.mode));
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = 0.02;
          return mesh;
        }
      }
      const boundary = el.geometry?.boundary;
      if (boundary?.length >= 3) {
        const pts = this.boundaryPoints(boundary);
        const shape = new THREE.Shape();
        shape.moveTo(pts[0].x, -pts[0].y);
        for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].y);
        shape.closePath();
        const geom = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(geom, materialForType('Room', this.mode));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = elev + 0.04;
        mesh.receiveShadow = true;
        return mesh;
      }
      const len = el.dimensions?.lengthM || 3;
      const wid = el.dimensions?.widthM || 3;
      const geom = new THREE.PlaneGeometry(len, wid);
      const mesh = new THREE.Mesh(geom, materialForType('Room', this.mode));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((el.position?.x || 0) + len / 2, elev + 0.04, (el.position?.y || 0) + wid / 2);
      mesh.receiveShadow = true;
      return mesh;
    }

    if (el.geometry?.kind === 'plot' && el.geometry.boundary) {
      const b = el.geometry.boundary;
      const shape = new THREE.Shape();
      shape.moveTo(b[0][0], -b[0][1]);
      for (let i = 1; i < b.length; i++) shape.lineTo(b[i][0], -b[i][1]);
      shape.closePath();
      const geom = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geom, materialForType('Site', this.mode));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01;
      mesh.receiveShadow = true;
      return mesh;
    }

    return null;
  }

  fitCamera(group) {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 4);
    const dist = maxDim * 1.35;
    if (this.mode === 'home') {
      this.camera.position.set(center.x + dist * 0.75, center.y + dist * 0.55, center.z + dist * 0.75);
    } else {
      this.camera.position.set(center.x + dist, center.y + dist * 0.75, center.z + dist);
    }
    this.controls.target.copy(center);
    this.controls.update();
    this.defaultCamera = {
      position: this.camera.position.clone(),
      target: center.clone(),
    };
  }

  setCameraView(view) {
    if (!this.modelGroup) return;
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 4);
    const dist = maxDim * 1.5;

    if (view === 'top') {
      this.camera.position.set(center.x, center.y + dist, center.z);
    } else if (view === 'front') {
      this.camera.position.set(center.x, center.y + size.y * 0.3, center.z + dist);
    } else if (view === 'iso') {
      this.camera.position.set(center.x + dist * 0.8, center.y + dist * 0.6, center.z + dist * 0.8);
    } else if (view === 'reset' && this.defaultCamera) {
      this.camera.position.copy(this.defaultCamera.position);
      this.controls.target.copy(this.defaultCamera.target);
      this.controls.update();
      return;
    }
    this.controls.target.copy(center);
    this.controls.update();
  }

  setActiveStorey(index) {
    this.activeStorey = index;
    if (this.model) this.loadModel(this.model);
  }

  setLayerVisible(layerName, visible) {
    const types = LAYER_TYPES[layerName] || [];
    types.forEach((t) => {
      if (visible) this.hiddenTypes.delete(t);
      else this.hiddenTypes.add(t);
    });
    if (this.model) this.loadModel(this.model);
  }

  getLayerTypes() {
    return LAYER_TYPES;
  }

  selectElement(id) {
    this.selectedId = id;
    for (const [eid, mesh] of this.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (m?.emissive) m.emissive.setHex(eid === id ? 0x332200 : 0x000000);
      });
    }
    const el = (this.model?.elements || []).find((e) => e.id === id);
    if (el) this.onSelect(el);
  }

  onClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.meshes.values()], true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.elementId && obj.parent) obj = obj.parent;
      if (obj?.userData?.elementId) this.selectElement(obj.userData.elementId);
    }
  }

  exportScreenshot(filename = 'bim-3d.png') {
    this.renderer.render(this.scene, this.camera);
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.renderer.domElement.toDataURL('image/png');
    link.click();
  }

  dispose() {
    this.clearMeshes();
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resizeHandler);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
