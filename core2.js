// ==================== Three.js 初始化 ====================
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8fafc);

const camera = new THREE.PerspectiveCamera(50, viewport.clientWidth / viewport.clientHeight, 0.1, 50000);
camera.up.set(0, 0, 1); // 主坐标系 Z 轴向上

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
dirLight.position.set(500, 800, 600);
dirLight.castShadow = true;
scene.add(dirLight);

let gridHelper, axesGroup;
function initAxesAndGrid(center, size) {
  if (gridHelper) scene.remove(gridHelper);
  if (axesGroup) scene.remove(axesGroup);
  
  const gridSize = Math.max(2000, size * 1.8);
  const gridDiv = Math.ceil(gridSize / 80);
  gridHelper = new THREE.GridHelper(gridSize, gridDiv, 0xd1d5db, 0xe5e7eb);
  gridHelper.position.set(center.x, center.y, center.z);
  gridHelper.rotation.x = Math.PI / 2; // 网格落到 XY 水平面，Z 向上为竖直方向
  scene.add(gridHelper);
  
  axesGroup = new THREE.Group();
  const axisLen = size * 0.4;
  function makeAxis(dir, color) {
    return new THREE.ArrowHelper(dir, center, axisLen, color, axisLen*0.08, axisLen*0.05);
  }
  axesGroup.add(makeAxis(new THREE.Vector3(1,0,0), 0xef4444));
  axesGroup.add(makeAxis(new THREE.Vector3(0,1,0), 0x22c55e));
  axesGroup.add(makeAxis(new THREE.Vector3(0,0,1), 0x3b82f6));
  
  function makeLabel(text, color, pos) {
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 40, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.position.copy(pos);
    sprite.scale.set(50, 50, 1);
    return sprite;
  }
  axesGroup.add(makeLabel('X', '#ef4444', new THREE.Vector3(center.x + axisLen*1.15, center.y, center.z)));
  axesGroup.add(makeLabel('Y', '#22c55e', new THREE.Vector3(center.x, center.y + axisLen*1.15, center.z)));
  axesGroup.add(makeLabel('Z', '#3b82f6', new THREE.Vector3(center.x, center.y, center.z + axisLen*1.15)));
  
  scene.add(axesGroup);
}

// 相机控制
let isDragging = false, isPanning = false;
let prevMouse = {x:0, y:0};
let spherical = { radius: 1200, theta: Math.PI, phi: 0.1 };
let panOffset = new THREE.Vector3(0,0,0);
let dataCenter = new THREE.Vector3(0,0,0);
let viewFlipped = false;       // false: Y 指向屏幕外（前视）; true: Y 指向屏幕里（后视）
let rightDownPos = null;       // 右键按下位置，用于区分单击与拖拽平移

function applyFrontView() {
  if (viewFlipped) {
    spherical.theta = 0;
    spherical.phi = Math.PI - 0.1;
  } else {
    spherical.theta = Math.PI;
    spherical.phi = 0.1;
  }
  updateCamera();
}

function updateCamera() {
  const sinPhi = Math.sin(spherical.phi), cosPhi = Math.cos(spherical.phi);
  const sinTheta = Math.sin(spherical.theta), cosTheta = Math.cos(spherical.theta);
  camera.position.set(
    spherical.radius * sinPhi * cosTheta + panOffset.x + dataCenter.x,
    spherical.radius * cosPhi + panOffset.y + dataCenter.y,
    spherical.radius * sinPhi * sinTheta + panOffset.z + dataCenter.z
  );
  camera.lookAt(panOffset.clone().add(dataCenter));
}

viewport.addEventListener('mousedown', e => {
  if (e.button === 0) isDragging = true;
  if (e.button === 2) {
    isPanning = true;
    rightDownPos = {x: e.clientX, y: e.clientY};
  }
  prevMouse = {x: e.clientX, y: e.clientY};
});
window.addEventListener('mouseup', e => {
  if (e.button === 2 && rightDownPos) {
    const dx = e.clientX - rightDownPos.x;
    const dy = e.clientY - rightDownPos.y;
    // 位移很小判定为右键单击：切换 Y 向朝向（前视 ↔ 后视）
    if (Math.sqrt(dx*dx + dy*dy) < 4) {
      viewFlipped = !viewFlipped;
      applyFrontView();
    }
    rightDownPos = null;
  }
  isDragging = false;
  isPanning = false;
});
window.addEventListener('mousemove', e => {
  const dx = e.clientX - prevMouse.x, dy = e.clientY - prevMouse.y;
  if (isDragging) {
    spherical.theta -= dx * 0.008;
    spherical.phi -= dy * 0.008;
    // 移除角度限位，允许360度自由旋转
    // spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi));
    updateCamera();
  }
  if (isPanning) {
    const panSpeed = spherical.radius * 0.0015;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    panOffset.add(right.multiplyScalar(-dx * panSpeed));
    panOffset.add(up.multiplyScalar(dy * panSpeed));
    updateCamera();
  }
  prevMouse = {x: e.clientX, y: e.clientY};
});
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  spherical.radius *= 1 + e.deltaY * 0.001;
  spherical.radius = Math.max(100, Math.min(20000, spherical.radius));
  updateCamera();
}, {passive: false});
viewport.addEventListener('contextmenu', e => e.preventDefault());

// 重置视图按钮：Z 正向上，X 正朝左，Y 正指向屏幕外（正前视图）
// 提示：在视口内右键单击可在前视/后视之间切换 Y 向
document.getElementById('resetView').addEventListener('click', () => {
  panOffset.set(0,0,0);
  viewFlipped = false;
  applyFrontView();
});

// 键盘快捷键：按 Y / y 键，整体视图绕 Z 轴水平旋转 180°
window.addEventListener('keydown', e => {
  // 输入框聚焦时不触发，避免在数值输入框里打字误触
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'y' || e.key === 'Y') {
    spherical.theta += Math.PI;
    updateCamera();
  }
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});


// ==================== 可视化对象组 ====================
let vizGroup = new THREE.Group();
scene.add(vizGroup);

// 参考模型独立组（不随 render() 清空）
let modelGroup = new THREE.Group();
scene.add(modelGroup);
let loadedModel = null;
let modelName = '';

function clearModel() {
  while (modelGroup.children.length > 0) {
    const o = modelGroup.children[0];
    modelGroup.remove(o);
    o.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
  loadedModel = null;
  modelName = '';
}

// 统一调整模型材质：半透明、保留原色、关闭深度写入避免透明面互相遮挡
function applyModelMaterial(root, opacity) {
  root.traverse(obj => {
    if (obj.isMesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        m.transparent = true;
        m.opacity = opacity;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
      });
      obj.renderOrder = 1;
    }
  });
}

function setModelOpacity(opacity) {
  if (!loadedModel) return;
  loadedModel.traverse(obj => {
    if (obj.isMesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => { m.opacity = opacity; });
    }
  });
}

function clearViz() {
  while (vizGroup.children.length > 0) {
    const o = vizGroup.children[0];
    vizGroup.remove(o);
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  }
}

function makeTextSprite(text, color, bgColor, fontSize) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fSize = fontSize || 32;
  ctx.font = `bold ${fSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + 16;
  const h = fSize + 12;
  canvas.width = w; canvas.height = h;
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(0,0,w,h,5);
    ctx.fill();
  }
  ctx.font = `bold ${fSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w/2, h/2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const scale = 4;
  sprite.scale.set(w/fSize * scale, h/fSize * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function createArrow(start, end, color) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 0.01) return new THREE.Group();
  const group = new THREE.Group();
  const headLen = Math.max(len * 0.2, Math.min(8, len * 0.3));
  const shaftLen = Math.max(0.01, len - headLen);
  const shaftRadius = Math.max(2, len * 0.02);
  const headRadius = Math.max(5, shaftRadius * 2.5);
  
  if (shaftLen > 0.01) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12),
      new THREE.MeshPhongMaterial({ color, shininess: 80 })
    );
    shaft.position.copy(start).add(new THREE.Vector3().copy(dir).setLength(shaftLen/2));
    shaft.lookAt(end);
    shaft.rotateX(Math.PI/2);
    group.add(shaft);
  }
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(headRadius, headLen, 12),
    new THREE.MeshPhongMaterial({ color, shininess: 80 })
  );
  head.position.copy(start).add(new THREE.Vector3().copy(dir).setLength(len - headLen/2));
  head.lookAt(new THREE.Vector3().copy(end).add(dir));
  head.rotateX(Math.PI/2);
  group.add(head);
  return group;
}
