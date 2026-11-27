// ==================== 分析与渲染 ====================
let dataPoints = [];

// 判断特征类型
function classifyPoint(name) {
  if (name.includes('基准')) return 'benchmark';
  if (/^\d+H\d/.test(name) || /H\d$/.test(name)) return 'h';
  if (name.includes('圆')) return 'circle';
  if (name.includes('矩形')) return 'rect';
  if (name.includes('槽')) return 'slot';
  if (/^\d+$/.test(name.trim())) return 'number';
  return 'other';
}

// 根据当前筛选条件返回子集
function getFilteredPoints() {
  const kw = (document.getElementById('filterKeyword').value || '').trim().toLowerCase();
  const type = document.getElementById('filterType').value;
  const status = document.getElementById('filterStatus').value;
  return dataPoints.filter(p => {
    if (kw && !p.name.toLowerCase().includes(kw)) return false;
    if (type !== 'all' && classifyPoint(p.name) !== type) return false;
    const isOut = p.outX || p.outY || p.outZ;
    if (status === 'out' && !isOut) return false;
    if (status === 'ok' && isOut) return false;
    return true;
  });
}

function analyze() {
  const usePerPoint = document.getElementById('usePerPointTol').checked;
  const globalTolX = parseFloat(document.getElementById('tolX').value) || 0.7;
  const globalTolY = parseFloat(document.getElementById('tolY').value) || 0.7;
  const globalTolZ = parseFloat(document.getElementById('tolZ').value) || 0.7;
  
  document.getElementById('globalTolPanel').style.opacity = usePerPoint ? '0.5' : '1';
  document.getElementById('globalTolPanel').style.pointerEvents = usePerPoint ? 'none' : 'auto';
  
  // 重新分析时按名称保留单点自定义外观配置（颜色/大小/可见性）
  const prevCustom = {};
  dataPoints.forEach(p => { if (p.custom) prevCustom[p.name] = p.custom; });
  dataPoints = currentPoints.map(p => {
    const dx = p.mx - p.nx, dy = p.my - p.ny, dz = p.mz - p.nz;
    const tx = usePerPoint ? p.tx : globalTolX;
    const ty = usePerPoint ? p.ty : globalTolY;
    const tz = usePerPoint ? p.tz : globalTolZ;
    return {
      ...p, custom: prevCustom[p.name], dx, dy, dz, tx, ty, tz,
      outX: Math.abs(dx) > tx,
      outY: Math.abs(dy) > ty,
      outZ: Math.abs(dz) > tz
    };
  });
  
  // 计算数据中心与范围
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
  dataPoints.forEach(p => {
    minX=Math.min(minX,p.nx); maxX=Math.max(maxX,p.nx);
    minY=Math.min(minY,p.ny); maxY=Math.max(maxY,p.ny);
    minZ=Math.min(minZ,p.nz); maxZ=Math.max(maxZ,p.nz);
  });
  dataCenter.set((minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2);
  const span = Math.max(maxX-minX, maxY-minY, maxZ-minZ);
  spherical.radius = span * 1.7;
  panOffset.set(0,0,0);
  
  initAxesAndGrid(dataCenter, span);
  updateCamera();
  render();
  updateStats();
}

// 按文字颜色亮度自动选背景底色：浅色字配深底，深色字配白底，保证文字与背景始终不同色
function labelBgFor(hex) {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum >= 0.6 ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';
}

function render() {
  clearViz();
  const filteredPoints = getFilteredPoints();
  document.getElementById('filterCount').textContent = `显示 ${filteredPoints.length} / ${dataPoints.length} 个`;
  const scale = parseFloat(document.getElementById('vectorScale').value);
  document.getElementById('scaleVal').textContent = scale;
  const showX = document.getElementById('showX').checked;
  const showY = document.getElementById('showY').checked;
  const showZ = document.getElementById('showZ').checked;
  const showNominal = document.getElementById('showNominal').checked;
  const showLabels = document.getElementById('showLabels').checked;
  const showDevLabels = document.getElementById('showDevLabels').checked;
  const axesVisible = document.getElementById('showAxes').checked;
  const nameFont = parseInt(document.getElementById('nameFontSize').value, 10) || 48;
  const devFont = parseInt(document.getElementById('devFontSize').value, 10) || 24;
  const baseDot = parseFloat(document.getElementById('dotSize').value) || 4;
  const showAllNames = document.getElementById('showAllNames').checked;
  document.getElementById('nameFontVal').textContent = nameFont;
  document.getElementById('devFontVal').textContent = devFont;
  document.getElementById('dotSizeVal').textContent = baseDot;
  if (gridHelper) gridHelper.visible = axesVisible;
  if (axesGroup) axesGroup.visible = axesVisible;

  filteredPoints.forEach(pt => {
    const nVec = new THREE.Vector3(pt.nx, pt.ny, pt.nz);
    const isOut = pt.outX || pt.outY || pt.outZ;
    const custom = pt.custom || {};
    const vecScale = parseFloat(document.getElementById('vectorScale').value);

    if (showNominal) {
      const dotColor = custom.dotColor ?? (isOut ? 0x475569 : 0x94a3b8);
      const dotR = custom.dotSize ?? (isOut ? baseDot : baseDot * 0.62);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(dotR, 12, 10),
        new THREE.MeshPhongMaterial({ color: dotColor, shininess: 60 })
      );
      dot.position.copy(nVec);
      dot.userData.pointName = pt.name;
      vizGroup.add(dot);
    }

    // 收集所有超差矢量末端点，找到最远的位置放名称（正好在箭头末端，不额外偏移）
    const ends = [];
    if (isOut) {
      if (showX && pt.outX) {
        const end = new THREE.Vector3(pt.nx + pt.dx * vecScale, pt.ny, pt.nz);
        ends.push(end);
        vizGroup.add(createArrow(nVec, end, 0xef4444));
        if (showDevLabels) {
          const lab = makeTextSprite(pt.dx.toFixed(2), '#dc2626', 'rgba(254,226,226,0.95)', devFont);
          lab.position.copy(end).add(new THREE.Vector3(0, 8, 0));
          vizGroup.add(lab);
        }
      }
      if (showY && pt.outY) {
        const end = new THREE.Vector3(pt.nx, pt.ny + pt.dy * vecScale, pt.nz);
        ends.push(end);
        vizGroup.add(createArrow(nVec, end, 0x22c55e));
        if (showDevLabels) {
          const lab = makeTextSprite(pt.dy.toFixed(2), '#16a34a', 'rgba(220,252,231,0.95)', devFont);
          lab.position.copy(end).add(new THREE.Vector3(0, 8, 0));
          vizGroup.add(lab);
        }
      }
      if (showZ && pt.outZ) {
        const end = new THREE.Vector3(pt.nx, pt.ny, pt.nz + pt.dz * vecScale);
        ends.push(end);
        vizGroup.add(createArrow(nVec, end, 0x3b82f6));
        if (showDevLabels) {
          const lab = makeTextSprite(pt.dz.toFixed(2), '#2563eb', 'rgba(219,234,254,0.95)', devFont);
          lab.position.copy(end).add(new THREE.Vector3(0, 8, 0));
          vizGroup.add(lab);
        }
      }
    }

    // 特征名称放在理论点附近，向上偏移避免遮挡点位；超差常显，合格点需开启“显示全部点名称”
    if (showLabels && custom.labelVisible !== false && (isOut || showAllNames)) {
      const labColor = custom.labelColor || '#0f172a';
      const labSize = custom.labelSize || nameFont;
      const nameLab = makeTextSprite(pt.name, labColor, labelBgFor(labColor), labSize);
      nameLab.position.copy(nVec).add(new THREE.Vector3(0, 15, 0));
      nameLab.userData.pointName = pt.name;
      vizGroup.add(nameLab);
    }
  });
}

function updateStats() {
  const filtered = getFilteredPoints();
  let outPoints = 0, outAxes = 0, maxDev = 0, maxName = "";
  const outList = [];
  filtered.forEach(p => {
    let axesOut = 0;
    let maxDA = 0;
    if (p.outX) { outAxes++; axesOut++; if (Math.abs(p.dx) > maxDA) maxDA = Math.abs(p.dx); }
    if (p.outY) { outAxes++; axesOut++; if (Math.abs(p.dy) > maxDA) maxDA = Math.abs(p.dy); }
    if (p.outZ) { outAxes++; axesOut++; if (Math.abs(p.dz) > maxDA) maxDA = Math.abs(p.dz); }
    if (axesOut > 0) {
      outPoints++;
      outList.push({...p, maxDev: maxDA, axesOut});
      if (maxDA > maxDev) { maxDev = maxDA; maxName = p.name; }
    }
  });

  const rate = filtered.length > 0 ? (outPoints / filtered.length * 100).toFixed(1) : '0';
  const totalLabel = filtered.length < dataPoints.length ? `${filtered.length} / ${dataPoints.length}` : filtered.length;
  document.getElementById('statsContent').innerHTML = `
    <div class="stat-card rounded-lg p-2 bg-slate-50 text-center">
      <div class="text-[11px] text-slate-500">总测点数</div>
      <div class="text-lg font-bold text-slate-800">${totalLabel}</div>
    </div>
    <div class="stat-card rounded-lg p-2 bg-rose-50 text-center">
      <div class="text-[11px] text-rose-600">超差点数</div>
      <div class="text-lg font-bold text-rose-600">${outPoints}</div>
    </div>
    <div class="stat-card rounded-lg p-2 bg-amber-50 text-center">
      <div class="text-[11px] text-amber-600">不合格率</div>
      <div class="text-lg font-bold text-amber-600">${rate}%</div>
    </div>
    <div class="stat-card rounded-lg p-2 bg-purple-50 text-center">
      <div class="text-[11px] text-purple-600">最大偏差</div>
      <div class="text-sm font-bold text-purple-600 mt-0.5">${maxName || '-'}</div>
      <div class="text-xs text-purple-500">${maxDev ? maxDev.toFixed(2) + 'mm' : '-'}</div>
    </div>
  `;

  outList.sort((a,b) => b.maxDev - a.maxDev);
  const listEl = document.getElementById('outOfTolList');
  listEl.innerHTML = outList.map(p => `
    <div class="rounded-lg bg-white border border-slate-100 p-2 hover:border-slate-200 transition">
      <div class="flex items-center justify-between mb-1">
        <span class="font-medium text-slate-700">${p.name}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded ${p.maxDev>1.5?'bg-rose-100 text-rose-700':'bg-amber-50 text-amber-700'}">
          最大${p.maxDev.toFixed(2)}
        </span>
      </div>
      <div class="flex gap-2 text-[11px] font-mono">
        ${p.outX ? `<span class="text-red-600">X:${p.dx>=0?'+':''}${p.dx.toFixed(2)}</span>` : ''}
        ${p.outY ? `<span class="text-green-600">Y:${p.dy>=0?'+':''}${p.dy.toFixed(2)}</span>` : ''}
        ${p.outZ ? `<span class="text-blue-600">Z:${p.dz>=0?'+':''}${p.dz.toFixed(2)}</span>` : ''}
        <span class="text-slate-400 ml-auto">±${p.tx === p.ty && p.ty === p.tz ? p.tx : '混合'}</span>
      </div>
    </div>
  `).join('');
}


// ==================== 模型导入处理 ====================
const modelZone = document.getElementById('modelZone');
const modelInput = document.getElementById('modelInput');
const modelInfo = document.getElementById('modelInfo');
const modelControls = document.getElementById('modelControls');

modelZone.addEventListener('click', () => modelInput.click());
modelZone.addEventListener('dragover', e => { e.preventDefault(); modelZone.classList.add('dragover'); });
modelZone.addEventListener('dragleave', () => modelZone.classList.remove('dragover'));
modelZone.addEventListener('drop', e => {
  e.preventDefault();
  modelZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) loadModelFile(e.dataTransfer.files[0]);
});
modelInput.addEventListener('change', e => {
  if (e.target.files.length > 0) loadModelFile(e.target.files[0]);
  modelInput.value = '';
});

function showModelInfo(text, type) {
  modelInfo.textContent = text;
  modelInfo.className = 'mt-2 text-xs ' + (type === 'error' ? 'text-red-600' : 'text-green-600');
  modelInfo.classList.remove('hidden');
}

function loadModelFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'glb') {
    showModelInfo('仅支持 .glb 格式模型文件', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      clearModel();
      // GLB 二进制单文件，GLTFLoader 异步回调
      new THREE.GLTFLoader().parse(e.target.result, '', gltf => {
        finishModel(gltf.scene || gltf.scenes[0], file.name);
      }, err => {
        console.error(err);
        showModelInfo('模型解析失败：' + err.message, 'error');
      });
    } catch (err) {
      console.error(err);
      showModelInfo('模型解析失败：' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function finishModel(root, name) {
  if (!root) { showModelInfo('模型中未找到可显示的网格', 'error'); return; }
  let meshCount = 0, triCount = 0;
  root.traverse(o => {
    if (o.isMesh) {
      meshCount++;
      if (o.geometry && o.geometry.attributes.position) {
        triCount += Math.floor(o.geometry.attributes.position.count / 3);
      }
    }
  });
  const opacity = parseFloat(document.getElementById('modelOpacity').value) / 100;
  applyModelMaterial(root, opacity);
  modelGroup.add(root);
  loadedModel = root;
  modelName = name;

  modelControls.classList.remove('hidden');
  document.getElementById('showModel').checked = true;
  showModelInfo(`✓ 已载入 ${name}（${meshCount} 个网格 / 约 ${triCount.toLocaleString()} 三角面）`, 'ok');
}

document.getElementById('showModel').addEventListener('change', e => {
  modelGroup.visible = e.target.checked;
});
document.getElementById('modelOpacity').addEventListener('input', e => {
  document.getElementById('modelOpacityVal').textContent = e.target.value + '%';
  setModelOpacity(parseFloat(e.target.value) / 100);
});
document.getElementById('removeModel').addEventListener('click', () => {
  clearModel();
  modelControls.classList.add('hidden');
  modelInfo.classList.add('hidden');
  modelInput.value = '';
});


// ==================== 文件上传处理 ====================
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const importMsg = document.getElementById('importMsg');
const statusText = document.getElementById('statusText');
const dataStatusBadge = document.getElementById('dataStatusBadge');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

function showMsg(text, type) {
  importMsg.textContent = text;
  importMsg.className = 'mt-2 text-xs ' + (type === 'error' ? 'text-red-600' : 'text-green-600');
  importMsg.classList.remove('hidden');
}

function handleFile(file) {
  if (!file.name.match(/\.(xls|xlsx)$/i)) {
    showMsg('请上传 .xls 或 .xlsx 格式的Excel文件', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const points = parseExcelData(wb);
      if (points.length < 1) {
        showMsg('未能识别到有效测点数据，请检查Excel格式', 'error');
        return;
      }
      currentPoints = points;
      analyze();
      statusText.textContent = `已导入 ${points.length} 个测点（来自 ${file.name}）`;
      dataStatusBadge.textContent = '已导入用户数据';
      dataStatusBadge.className = 'px-2 py-1 rounded bg-blue-100 text-blue-700';
      showMsg(`✓ 成功解析 ${points.length} 个测点，自动完成偏差分析`, 'success');
    } catch (err) {
      console.error(err);
      showMsg('文件解析失败：' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}


// ==================== 事件绑定 ====================
document.getElementById('reAnalyzeBtn').addEventListener('click', analyze);
document.getElementById('usePerPointTol').addEventListener('change', analyze);
['showX','showY','showZ','showNominal','showAxes','showLabels','showDevLabels','vectorScale','nameFontSize','devFontSize','dotSize','showAllNames'].forEach(id => {
  document.getElementById(id).addEventListener('change', render);
  document.getElementById(id).addEventListener('input', render);
});

// 筛选条件变化 → 重新渲染并刷新统计/清单
function applyFilter() {
  render();
  updateStats();
}
document.getElementById('filterKeyword').addEventListener('input', applyFilter);
document.getElementById('filterType').addEventListener('change', applyFilter);
document.getElementById('filterStatus').addEventListener('change', applyFilter);
document.getElementById('filterReset').addEventListener('click', () => {
  document.getElementById('filterKeyword').value = '';
  document.getElementById('filterType').value = 'all';
  document.getElementById('filterStatus').value = 'all';
  applyFilter();
});

// 页面加载完成后自动分析
window.addEventListener('load', () => {
  analyze();
});
