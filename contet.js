let tasks = [], filter = 'all';
const $ = id => document.getElementById(id);
const feedback = message => { $('feedback').textContent = message; };
async function api(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 401) { location.replace('/index.html'); throw new Error('登录已过期'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data;
}
function dayOffset(due) {
  const now = new Date();
  return Math.round((Date.parse(due) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function render() {
  const active = tasks.filter(t => !t.deleted);
  const done = active.filter(t => t.completed).length;
  const percent = active.length ? Math.round(done / active.length * 100) : 0;
  $('total').textContent = active.length; $('done').textContent = done; $('pending').textContent = active.length - done;
  $('percent').replaceChildren(document.createTextNode(String(percent)), element('em', '', '%'));
  $('progress').value = percent;
  const soon = active.filter(t => !t.completed && dayOffset(t.due) >= 0 && dayOffset(t.due) <= 2).length;
  const overdue = active.filter(t => !t.completed && dayOffset(t.due) < 0).length;
  $('reminder').hidden = !soon && !overdue;
  $('reminder').textContent = `◷ 你有 ${soon} 项任务即将到期（今天及未来两天），${overdue} 项已逾期。给重要的事留一点时间。`;
  const visible = tasks.filter(t => (filter === 'trash' ? t.deleted : !t.deleted && (filter === 'all' || Boolean(t.completed) === (filter === 'done'))) && ($('category-filter').value === 'all' || t.category === $('category-filter').value));
  $('list-count').textContent = `${visible.length} 项`;
  $('empty').hidden = visible.length > 0;
  $('empty').querySelector('h3').textContent = tasks.length ? '当前筛选下没有任务' : '留一点空间，给新的计划';
  $('empty').querySelector('p').textContent = tasks.length ? '试试切换状态或分类，查看其他任务。' : '这里还没有任务，添加一件想完成的小事吧。';
  if (filter === 'trash') { $('empty').querySelector('h3').textContent = '回收站是空的'; $('empty').querySelector('p').textContent = '删除的任务会保留在这里，随时可以恢复。'; }
  $('task-list').replaceChildren(...visible.map(task => {
    const offset = dayOffset(task.due);
    const row = element('li', `task ${task.completed ? 'completed' : offset < 0 ? 'overdue' : offset <= 2 ? 'soon' : ''}`);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = Boolean(task.completed); checkbox.setAttribute('aria-label', `标记“${task.title}”为${task.completed ? '未完成' : '已完成'}`);
    checkbox.disabled = Boolean(task.deleted);
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try { await api(`/api/tasks/${task.id}`, 'PATCH', { completed: checkbox.checked }); task.completed = Number(checkbox.checked); row.classList.toggle('completed', checkbox.checked); row.classList.add('completing'); await new Promise(resolve => setTimeout(resolve, 320)); feedback(''); render(); }
      catch (error) { checkbox.checked = Boolean(task.completed); checkbox.disabled = false; feedback(error.message); }
    });
    const body = element('div', 'task-body');
    const meta = element('div', 'task-meta');
    const label = !task.completed && offset < 0 ? ' · 已逾期' : !task.completed && offset === 0 ? ' · 今天到期' : !task.completed && offset <= 2 ? ' · 即将到期' : '';
    meta.append(element('span', 'due', `${task.due}${label}`), element('span', 'tag', task.category));
    const title = element('button', 'task-title task-open', task.title);
    title.type = 'button'; title.setAttribute('aria-haspopup', 'dialog');
    title.addEventListener('click', () => openNotes(task));
    body.append(title, meta, element('span', 'notes-preview', task.notes || '点击任务添加备注'));
    row.addEventListener('click', event => { if (!event.target.closest('button, input')) openNotes(task); });
    const remove = element('button', 'delete-button', task.deleted ? '恢复' : '删除');
    remove.setAttribute('aria-label', `${task.deleted ? "恢复" : "删除"}“${task.title}”`);
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try { await api(`/api/tasks/${task.id}`, task.deleted ? 'PATCH' : 'DELETE', task.deleted ? { deleted: false } : {}); task.deleted = Number(!task.deleted); feedback(''); render(); }
      catch (error) { remove.disabled = false; feedback(error.message); }
    });
    row.append(checkbox, body, element('span', `priority ${{高:'high',中:'medium',低:'low'}[task.priority]}`, `${task.priority}优先级`), remove);
    return row;
  }));
}
$('task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/tasks', 'POST', Object.fromEntries(new FormData(form)));
    form.reset();
    tasks = await api('/api/tasks'); feedback(''); render(); form.elements.title.focus();
  } catch (error) { feedback(error.message); }
  finally { button.disabled = false; }
});
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  render();
}));
$('category-filter').addEventListener('change', render);
$('logout').addEventListener('click', async () => {
  try { await api('/api/logout', 'POST', {}); location.replace('/index.html'); }
  catch (error) { feedback(error.message); }
});
function tick() { $('clock').textContent = new Date().toLocaleString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }); }
tick(); setInterval(tick, 1000);
setInterval(() => { if (tasks.length) render(); }, 60000);
(async () => {
  if (location.protocol === 'file:') { feedback('请通过 http://127.0.0.1:3000 登录后使用待办页面。'); return; }
  try { const user = await api('/api/me'); $('username').textContent = user.username; tasks = await api('/api/tasks'); render(); }
  catch (error) { feedback(error.message); }
})();
let editingTask = null;
function openNotes(task) {
  editingTask = task;
  $('notes-task-title').textContent = task.title;
  $('notes-input').value = task.notes || '';
  $('notes-input').readOnly = Boolean(task.deleted);
  $('save-notes').hidden = Boolean(task.deleted);
  $('notes-status').textContent = task.deleted ? '回收站中的备注可查看，恢复任务后可继续编辑。' : '';
  $('notes-dialog').showModal();
}
$('close-notes').addEventListener('click', () => $('notes-dialog').close());
$('notes-form').addEventListener('submit', async event => {
  event.preventDefault();
  const task = editingTask, value = $('notes-input').value;
  $('save-notes').disabled = true;
  $('close-notes').disabled = true;
  try {
    await api(`/api/tasks/${task.id}`, 'PATCH', { notes: value });
    task.notes = value; $('notes-dialog').close(); render();
  } catch (error) { $('notes-status').textContent = error.message; }
  finally { $('save-notes').disabled = false; $('close-notes').disabled = false; }
});
$('notes-dialog').addEventListener('cancel', event => { if ($('save-notes').disabled) event.preventDefault(); });
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-toggle').textContent = dark ? '☀ 浅色模式' : '☾ 暗黑模式';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
}
try { setTheme(localStorage.getItem('weiguang-theme') === 'dark'); } catch { setTheme(false); }
$('theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  setTheme(dark);
  try { localStorage.setItem('weiguang-theme', dark ? 'dark' : 'light'); } catch {}
});
