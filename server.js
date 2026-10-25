const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function createApp(databasePath = path.join(__dirname, 'weiguang.sqlite')) {
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, due TEXT NOT NULL, priority TEXT NOT NULL,
      category TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);`);
  const columns = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name);
  if (!columns.includes('notes')) db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  if (!columns.includes('deleted')) db.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
  const hash = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
  const files = { '/speech.css': 'speech.css', '/speech.js': 'speech.js', '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css',
    '/auth.js': 'auth.js', '/contet.html': 'contet.html', '/contet.css': 'contet.css', '/contet.js': 'contet.js' };
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('session='))?.slice(8);
      const user = token && db.prepare('SELECT users.id, username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(token, Date.now());
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' || !files[url.pathname]) return send(404, { error: '页面不存在' });
        if (url.pathname === '/contet.html' && !user) {
          res.writeHead(302, { Location: '/index.html' }); return res.end();
        }
        const file = files[url.pathname];
        const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(fs.readFileSync(path.join(__dirname, file)));
      }
      let data = {};
      if (req.method !== 'GET') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: '请求来源不正确' });
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(415, { error: '请求格式不正确' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 16384) return send(413, { error: '内容过长' });
        }
        try { data = JSON.parse(body || '{}'); } catch { return send(400, { error: '请求格式不正确' }); }
        if (!data || Array.isArray(data) || typeof data !== 'object') return send(400, { error: '请求格式不正确' });
      }
      if (url.pathname === '/api/register' && req.method === 'POST') {
        const { username, email, password, confirm_password } = data;
        if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 30 || username.includes('@') ||
            typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            typeof password !== 'string' || password.length < 8 || password.length > 128 || password !== confirm_password)
          return send(400, { error: '请检查信息：用户名 2–30 位且不含 @，邮箱有效，两次密码一致且为 8–128 位。' });
        const salt = crypto.randomBytes(16).toString('hex');
        try { db.prepare('INSERT INTO users(username,email,salt,password) VALUES(?,?,?,?)').run(username.trim(), email.trim(), salt, hash(password, salt)); }
        catch (error) { if (String(error.message).includes('UNIQUE')) return send(409, { error: '用户名或邮箱已被注册' }); throw error; }
        return send(201, { ok: true });
      }
      if (url.pathname === '/api/login' && req.method === 'POST') {
        if (typeof data.account !== 'string' || typeof data.password !== 'string' || data.password.length > 128) return send(400, { error: '请填写有效的账号和密码' });
        const account = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(data.account.trim(), data.account.trim());
        const candidate = hash(data.password, account?.salt || 'invalid-account');
        if (!account || !crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(account.password, 'hex'))) return send(401, { error: '账号或密码不正确' });
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
        if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
        const session = crypto.randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session, account.id, Date.now() + 86400000);
        res.setHeader('Set-Cookie', `session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
        return send(200, { ok: true });
      }
      if (!user) return send(401, { error: '请先登录' });
      if (url.pathname === '/api/me' && req.method === 'GET') return send(200, { username: user.username });
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(token);
        res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/tasks' && req.method === 'GET') return send(200, db.prepare('SELECT id,title,due,priority,category,completed,notes,deleted FROM tasks WHERE user_id=? ORDER BY completed,due,id DESC').all(user.id));
      if (url.pathname === '/api/tasks' && req.method === 'POST') {
        const { title, due, priority, category } = data;
        if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 ||
            typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0,10) !== due ||
            !['高','中','低'].includes(priority) || !['学习','项目','生活','大创'].includes(category)) return send(400, { error: '请填写任务内容、有效日期、优先级和分类' });
        const result = db.prepare('INSERT INTO tasks(user_id,title,due,priority,category) VALUES(?,?,?,?,?)').run(user.id, title.trim(), due, priority, category);
        return send(201, { id: Number(result.lastInsertRowid) });
      }
      const match = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
      if (match && ['PATCH','DELETE'].includes(req.method)) {
        let result;
        if (req.method === 'DELETE') {
          result = db.prepare('UPDATE tasks SET deleted=1 WHERE id=? AND user_id=? AND deleted=0').run(Number(match[1]), user.id);
        } else {
          const keys = Object.keys(data);
          if (keys.length !== 1 || !['completed','notes','deleted'].includes(keys[0])) return send(400, { error: '更新字段不正确' });
          const key = keys[0];
          if ((key === 'notes' && (typeof data.notes !== 'string' || data.notes.length > 3000)) ||
              (key === 'completed' && typeof data.completed !== 'boolean') ||
              (key === 'deleted' && data.deleted !== false)) return send(400, { error: '备注最多 3000 字，状态值必须有效' });
          const value = key === 'notes' ? data.notes : Number(data[key]);
          result = db.prepare('UPDATE tasks SET ' + key + '=? WHERE id=? AND user_id=? AND deleted=?').run(value, Number(match[1]), user.id, key === 'deleted' ? 1 : 0);
        }
        return send(result.changes ? 200 : 404, result.changes ? { ok: true } : { error: '任务不存在' });
      }
      return send(404, { error: '接口不存在' });
    } catch (error) { console.error(error); send(500, { error: '服务暂时异常，请稍后重试' }); }
  });
  server.on('close', () => db.close());
  return server;
}
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '127.0.0.1', () => console.log(`微光已启动：http://127.0.0.1:${port}`));
}
module.exports = { createApp };
