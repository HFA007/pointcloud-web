// ==================== Excel格式智能解析器 ====================
// 控制列轴向归一化：兼容严格 X/Y/Z，以及“曲面点X / 曲面点Y / 曲面点Z”这类带后缀写法；
// 曲面距离等标量行不含 X/Y/Z，直接忽略。
function resolveAxis(raw) {
  const a = String(raw == null ? '' : raw).trim().toUpperCase();
  if (a === 'X' || a === 'Y' || a === 'Z') return a;
  const m = a.match(/[XYZ]\s*$/);
  return m ? m[0].trim() : null;
}

function parseExcelData(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 寻找表头行（包含"名称"+"控制"/"X"/"Y"/"Z"的行）
  let headerRow = -1;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i].map(c => String(c).trim());
    const hasName = row.some(c => c.includes('名称') || c === '点名' || c === '点号');
    const hasAxis = row.some(c => ['X','Y','Z','x','y','z','控制','轴'].includes(c));
    if (hasName && hasAxis) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) headerRow = 5; // 默认从第6行开始（0-indexed=5）

  const points = {};
  let nameCol = -1, axisCol = -1, nomCol = -1, measCol = -1, tolCol = -1;

  // 自动识别列位置
  const header = data[headerRow].map(c => String(c).trim());
  header.forEach((h, idx) => {
    if (h.includes('名称') || h === '点名' || h === '点号' || h === '特征名') nameCol = idx;
    if (['X','Y','Z','x','y','z','控制','轴','方向'].includes(h)) axisCol = idx;
    if (h.includes('名义') || h.includes('理论') || h.includes('标称') || h === 'NOMINAL' || h === 'NOM') nomCol = idx;
    if (h.includes('测量') || h.includes('实测') || h === 'MEASURED' || h === 'MEAS') measCol = idx;
    if (h.includes('公差') || h === 'TOL' || h === '偏差带') tolCol = idx;
  });

  // 如果没找到列，按常见位置兜底（名称0，轴1，名义2，测量3，公差4）
  if (nameCol === -1) nameCol = 0;
  if (axisCol === -1) axisCol = 1;
  if (nomCol === -1) nomCol = 2;
  if (measCol === -1) measCol = 3;
  if (tolCol === -1) tolCol = 4;

  // 解析每行数据
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;
    const name = String(row[nameCol] || '').trim();
    // 跳过空行、分段重复表头行
    if (!name || name === '名称' || name === '点名' || name === '点号') continue;

    const axis = resolveAxis(row[axisCol]);
    if (!axis) continue; // 非 X/Y/Z 行（曲面距离、单位/坐标系等元信息）一律忽略

    let nom = parseFloat(row[nomCol]);
    let meas = parseFloat(row[measCol]);
    if (isNaN(nom) && isNaN(meas)) continue;
    if (isNaN(nom)) nom = 0;
    if (isNaN(meas)) meas = 0;

    // 解析公差（支持±0.7、0.7、+/-0.7等格式）
    let tol = 0.7;
    if (tolCol >=0 && row[tolCol]) {
      const tolStr = String(row[tolCol]).replace(/[±+]/g, '').trim();
      const parsedTol = parseFloat(tolStr);
      if (!isNaN(parsedTol) && parsedTol > 0) tol = parsedTol;
    }

    // 根据名称判断公差类型（基准/孔/安装位一般±0.7，形面±0.5）
    if (tol === 0.7) {
      if (/^\d{2,3}H\d$/.test(name)) {
        // 98H1这类形面点，公差±0.5
        tol = 0.5;
      } else if (name.includes('圆') || name.includes('矩形') || name.includes('槽')) {
        // 孔/特征，默认按实际公差，如果没读到就0.5
        tol = 0.5;
      }
    }

    if (!points[name]) {
      points[name] = { name, nx:0, ny:0, nz:0, mx:0, my:0, mz:0, tx:0.7, ty:0.7, tz:0.7 };
    }

    if (axis === 'X') { points[name].nx = nom; points[name].mx = meas; points[name].tx = tol; }
    else if (axis === 'Y') { points[name].ny = nom; points[name].my = meas; points[name].ty = tol; }
    else if (axis === 'Z') { points[name].nz = nom; points[name].mz = meas; points[name].tz = tol; }
  }

  // 过滤掉名义/测量全为 0 的无效点
  return Object.values(points).filter(p =>
    !(p.nx === 0 && p.ny === 0 && p.nz === 0) &&
    !(p.mx === 0 && p.my === 0 && p.mz === 0)
  );
}


// ==================== 内置示例数据（从你上传的Excel提取） ====================
const BUILTIN_POINTS = [
  {"name":"圆-基准A","nx":4186.5,"ny":-595.631,"nz":1569.0,"mx":4186.5,"my":-595.527,"mz":1569.0,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"槽-基准B","nx":4874.0,"ny":-734.0,"nz":1169.0,"mx":4873.289,"my":-734.346,"mz":1169.0,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"98H2","nx":4151.8,"ny":-723.0,"nz":912.0,"mx":4152.163,"my":-723.994,"mz":911.633,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"98H1","nx":4255.6,"ny":-716.351,"nz":1085.0,"mx":4255.486,"my":-717.884,"mz":1084.774,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"104","nx":4452.0,"ny":-625.6,"nz":1081.0,"mx":4451.74,"my":-626.294,"mz":1081.233,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"105","nx":4477.0,"ny":-628.6,"nz":1154.0,"mx":4476.567,"my":-628.237,"mz":1154.258,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"96H3","nx":4327.0,"ny":-699.457,"nz":1245.495,"mx":4326.49,"my":-699.83,"mz":1245.693,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"96H2","nx":4281.0,"ny":-665.704,"nz":1381.675,"mx":4280.598,"my":-665.717,"mz":1381.814,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"96H1","nx":4168.893,"ny":-594.654,"nz":1572.647,"mx":4168.489,"my":-594.183,"mz":1573.197,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"96H4","nx":4845.267,"ny":-525.341,"nz":1500.751,"mx":4844.689,"my":-526.023,"mz":1500.29,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"95H2","nx":4859.121,"ny":-530.561,"nz":1481.272,"mx":4858.451,"my":-531.083,"mz":1480.749,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"98H4","nx":5207.0,"ny":-562.0,"nz":999.9,"mx":5204.895,"my":-564.34,"mz":998.787,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"矩形3","nx":4274.491,"ny":-779.778,"nz":1026.822,"mx":4273.173,"my":-781.043,"mz":1026.714,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"矩形4","nx":4259.326,"ny":-782.324,"nz":994.271,"mx":4257.77,"my":-783.59,"mz":994.289,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆3","nx":4790.401,"ny":-337.0,"nz":1621.68,"mx":4790.993,"my":-336.595,"mz":1621.371,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆4","nx":4790.401,"ny":-363.0,"nz":1621.68,"mx":4790.941,"my":-362.594,"mz":1621.308,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆5","nx":4788.3,"ny":-412.0,"nz":1583.0,"mx":4788.049,"my":-412.254,"mz":1582.894,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆6","nx":4988.0,"ny":-549.0,"nz":1373.0,"mx":4987.215,"my":-549.812,"mz":1372.414,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"矩形1","nx":4904.549,"ny":-626.772,"nz":1292.719,"mx":4903.777,"my":-626.332,"mz":1291.428,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆7","nx":3964.0,"ny":-734.7,"nz":532.0,"mx":3963.012,"my":-736.592,"mz":532.334,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"圆8","nx":3961.0,"ny":-744.6,"nz":464.0,"mx":3961.251,"my":-743.745,"mz":463.561,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆9","nx":4165.0,"ny":-495.0,"nz":1699.1,"mx":4165.843,"my":-495.227,"mz":1701.379,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆10","nx":4375.789,"ny":-474.78,"nz":1685.369,"mx":4376.598,"my":-474.128,"mz":1686.451,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆11","nx":4418.0,"ny":-475.0,"nz":1679.0,"mx":4418.672,"my":-474.218,"mz":1679.741,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆12","nx":4459.789,"ny":-474.78,"nz":1677.912,"mx":4459.812,"my":-474.102,"mz":1678.266,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆13","nx":4720.0,"ny":-378.0,"nz":1592.0,"mx":4720.212,"my":-378.163,"mz":1591.605,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆14","nx":4544.716,"ny":-554.881,"nz":1615.467,"mx":4544.694,"my":-554.717,"mz":1615.379,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆15","nx":4475.843,"ny":-560.831,"nz":1615.381,"mx":4475.818,"my":-560.646,"mz":1615.064,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆16","nx":4202.0,"ny":-552.0,"nz":1665.0,"mx":4201.798,"my":-551.789,"mz":1665.945,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆17","nx":4030.0,"ny":-598.06,"nz":1687.658,"mx":4030.211,"my":-595.637,"mz":1689.097,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"圆18","nx":4156.0,"ny":-593.0,"nz":776.5,"mx":4157.525,"my":-591.448,"mz":775.559,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆18-2","nx":4177.0,"ny":-584.0,"nz":776.5,"mx":4178.511,"my":-582.49,"mz":775.231,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆19","nx":4621.0,"ny":-526.6,"nz":828.0,"mx":4620.823,"my":-527.007,"mz":826.393,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆20","nx":4645.0,"ny":-530.1,"nz":788.0,"mx":4645.375,"my":-530.69,"mz":786.542,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆21","nx":4936.837,"ny":-775.001,"nz":734.0,"mx":4937.86,"my":-775.123,"mz":734.175,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"圆22","nx":4622.0,"ny":-712.0,"nz":1320.0,"mx":4621.115,"my":-712.51,"mz":1319.43,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆23","nx":4673.967,"ny":-893.0,"nz":936.019,"mx":4671.948,"my":-892.809,"mz":935.745,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"圆24","nx":3846.801,"ny":-818.005,"nz":418.2,"mx":3846.576,"my":-821.763,"mz":416.834,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"圆25","nx":4145.0,"ny":-750.5,"nz":889.5,"mx":4143.925,"my":-751.022,"mz":889.041,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"槽2","nx":4311.0,"ny":-718.5,"nz":1354.0,"mx":4311.315,"my":-717.688,"mz":1356.135,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆26","nx":4243.0,"ny":-673.0,"nz":1471.0,"mx":4243.101,"my":-672.246,"mz":1472.969,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆27","nx":4126.0,"ny":-724.301,"nz":869.0,"mx":4126.448,"my":-723.871,"mz":868.452,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"矩形2","nx":4048.24,"ny":-739.284,"nz":776.026,"mx":4048.727,"my":-738.993,"mz":775.79,"tx":0.5,"ty":0.5,"tz":0.5},
  {"name":"圆29","nx":3751.0,"ny":-817.921,"nz":404.0,"mx":3750.774,"my":-816.137,"mz":402.172,"tx":0.7,"ty":0.7,"tz":0.7},
  {"name":"槽13","nx":4346.726,"ny":-612.961,"nz":1603.453,"mx":4346.785,"my":-612.24,"mz":1603.549,"tx":0.5,"ty":0.5,"tz":0.5}
];

let currentPoints = BUILTIN_POINTS;
