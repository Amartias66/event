const login = document.querySelector('.login-panel form');
const register = document.querySelector('.register-panel form');
const message = document.createElement('p');
message.className = 'panel-note';
message.setAttribute('role', 'status');
document.querySelector('.switch-tabs').after(message);
if (location.protocol === 'file:') {
  message.textContent = '请先启动 server.js，然后通过 http://127.0.0.1:3000 打开页面。';
}
async function submit(event, endpoint) {
  event.preventDefault();
  if (location.protocol === 'file:') return;
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  message.textContent = '正在处理…';
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (endpoint === '/api/login') { location.href = '/contet.html'; return; }
    login.elements.account.value = register.elements.username.value.trim();
    register.reset();
    document.getElementById('mode-login').checked = true;
    message.textContent = '账号创建成功，请登录。';
    document.getElementById('login-password').focus();
  } catch (error) { message.textContent = error.message || '连接失败，请重试'; }
  finally { button.disabled = false; }
}
login.addEventListener('submit', event => submit(event, '/api/login'));
register.addEventListener('submit', event => submit(event, '/api/register'));
