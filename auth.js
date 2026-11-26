// ==================== 前端口令门禁（轻量门禁，仅挡普通访客） ====================
// 【账号密码在此修改】注意：这是前端校验，源码可见，只能防止随手点开的路人，
// 不能阻止懂技术的人绕过；如需真正的访问控制，请改用托管层鉴权（如 Cloudflare Access）。
const AUTH_CONFIG = {
  username: 'admin',
  password: 'pc@2026'
};

(function () {
  const gate = document.getElementById('authGate');
  const userEl = document.getElementById('authUser');
  const passEl = document.getElementById('authPass');
  const btn = document.getElementById('authBtn');
  const msg = document.getElementById('authMsg');
  if (!gate) return;

  function passed() {
    gate.classList.add('gate-hidden');
    setTimeout(function () { gate.style.display = 'none'; }, 260);
  }

  function fail() {
    msg.classList.remove('hidden');
    passEl.value = '';
    passEl.focus();
  }

  function tryLogin() {
    const u = (userEl.value || '').trim();
    const p = passEl.value || '';
    if (u === AUTH_CONFIG.username && p === AUTH_CONFIG.password) {
      sessionStorage.setItem('pc_auth_ok', '1');
      msg.classList.add('hidden');
      passed();
    } else {
      fail();
    }
  }

  btn.addEventListener('click', tryLogin);
  passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
  userEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') passEl.focus(); });

  // 本次会话已通过则直接放行；关闭标签页后需重新登录
  if (sessionStorage.getItem('pc_auth_ok') === '1') {
    gate.style.display = 'none';
  } else {
    userEl.focus();
  }
})();
