const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('./server');
test('注册、登录、账号隔离、任务持久化和退出登录', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weiguang-test-'));
  const database = path.join(dir, 'test.sqlite');
  let server, base;
  async function start() { server = createApp(database); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; }
  async function request(route, method = 'GET', body, cookie = '') {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
    const text = await response.text();
    return { status: response.status, data: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  try {
    await start();
    assert.equal((await request('/api/tasks')).status, 401);
    assert.equal((await request('/contet.html')).status, 302);
    const account = { username:'测试甲', email:'a@example.com', password:'password123', confirm_password:'password123' };
    assert.equal((await request('/api/register','POST',{ ...account, confirm_password:'different' })).status,400);
    assert.equal((await request('/api/register','POST',account)).status,201);
    assert.equal((await request('/api/register','POST',account)).status,409);
    assert.equal((await request('/api/register','POST',{...account, username:'测试乙',email:'b@example.com'})).status,201);
    assert.equal((await request('/api/login','POST',{account:'测试甲',password:'wrong'})).status,401);
    const a = (await request('/api/login','POST',{account:'测试甲',password:'password123'})).cookie;
    const b = (await request('/api/login','POST',{account:'b@example.com',password:'password123'})).cookie;
    assert.ok(a); assert.ok(b);
    const task = { title:'完成项目 <script>', due:'2026-09-14',priority:'高',category:'项目' };
    assert.equal((await request('/api/tasks','POST',{...task,due:'2026-02-30'},a)).status,400);
    const created = await request('/api/tasks','POST',task,a);
    assert.equal(created.status,201);
    const route = '/api/tasks/' + created.data.id;
    assert.deepEqual((await request('/api/tasks','GET',undefined,b)).data,[]);
    assert.equal((await request(route,'PATCH',{completed:true},b)).status,404);
    assert.equal((await request(route,'DELETE',{},b)).status,404);
    assert.equal((await request(route,'PATCH',{completed:true},a)).status,200);
    assert.equal((await request(route,'PATCH',{notes:'第一行\n第二行 <b>原样保存</b>'},a)).status,200);
    assert.equal((await request(route,'PATCH',{notes:'越权'},b)).status,404);
    assert.equal((await request(route,'PATCH',{notes:'x'.repeat(3001)},a)).status,400);
    await new Promise(resolve => server.close(resolve)); await start();
    const stored = (await request('/api/tasks','GET',undefined,a)).data;
    assert.equal(stored.length,1); assert.equal(stored[0].completed,1); assert.equal(stored[0].title,task.title);
    assert.equal(stored[0].notes,'第一行\n第二行 <b>原样保存</b>');
    assert.equal((await request('/weiguang.sqlite','GET',undefined,a)).status,404);
    assert.equal((await request('/contet.html','GET',undefined,a)).status,200);
    assert.equal((await request(route,'DELETE',{},a)).status,200);
    let recycled = (await request('/api/tasks','GET',undefined,a)).data[0];
    assert.equal(recycled.deleted,1);
    assert.equal(recycled.notes,stored[0].notes);
    assert.equal((await request(route,'PATCH',{deleted:false},b)).status,404);
    assert.equal((await request(route,'PATCH',{notes:'不能修改回收站'},a)).status,404);
    await new Promise(resolve => server.close(resolve)); await start();
    assert.equal((await request('/api/tasks','GET',undefined,a)).data[0].deleted,1);
    assert.equal((await request(route,'PATCH',{deleted:false},a)).status,200);
    recycled = (await request('/api/tasks','GET',undefined,a)).data[0];
    assert.equal(recycled.deleted,0); assert.equal(recycled.completed,1); assert.equal(recycled.notes,stored[0].notes);
    assert.equal((await request('/api/logout','POST',{},a)).status,200);
    assert.equal((await request('/api/me','GET',undefined,a)).status,401);
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, {recursive:true,force:true});
  }
});
