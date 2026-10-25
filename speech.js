(() => {
  'use strict';
  const controls = document.getElementById('speech-controls');
  if (!controls || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
  const synth = window.speechSynthesis;
  const get = id => document.getElementById(id);
  const toggle = get('speech-toggle'), select = get('speech-voice');
  const rate = get('speech-rate'), pitch = get('speech-pitch'), status = get('speech-status');
  const key = 'weiguang-speech-settings';
  const clamp = (v, min, max) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1;
  let settings = { enabled: false, voice: '', rate: 1, pitch: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    settings = { enabled: saved?.enabled === true, voice: typeof saved?.voice === 'string' ? saved.voice : '', rate: clamp(saved?.rate, .5, 2), pitch: clamp(saved?.pitch, 0, 2) };
  } catch {}
  let voices = [];
  const pending = new Set();
  const messages = [
    '恭喜你，任务完成啦！继续加油！',
    '又完成一件事，离目标更近一步！',
    '做得好！你的认真，正在变成成果。',
    '小小的进步，也值得大大的肯定！',
    '这件事搞定了，给自己一个赞！',
    '今天的努力，又多了一份收获。',
    '太棒了！保持自己的节奏，慢慢向前。',
    '一项任务，一次成长。你正在稳步前进！',
    '完成啦！伸个懒腰，放松一下吧。',
    '你把计划变成了行动，真不错！',
    '又点亮了一点微光，为自己鼓掌！',
    '认真走过的每一步，都有意义。',
    '这一关顺利通过！下一步也从容一点。',
    '任务清单又短了一点，成就感多了一点！',
    '做完这一件，今天就多了一份踏实。',
    '辛苦啦！喝口水，享受一下完成的快乐。'
  ];
  let remaining = [], lastMessage = '';
  function nextMessage() {
    if (!remaining.length) remaining = [...messages];
    const choices = remaining.filter(message => message !== lastMessage);
    const message = choices[Math.floor(Math.random() * choices.length)];
    remaining.splice(remaining.indexOf(message), 1);
    lastMessage = message;
    return message;
  }
  const save = () => { try { localStorage.setItem(key, JSON.stringify(settings)); } catch {} };
  const voiceKey = voice => JSON.stringify([voice.voiceURI, voice.name, voice.lang]);
  function update() {
    toggle.textContent = settings.enabled ? '播报：开启' : '播报：关闭';
    toggle.setAttribute('aria-pressed', String(settings.enabled));
    rate.value = settings.rate; pitch.value = settings.pitch;
    get('speech-rate-value').textContent = settings.rate.toFixed(1);
    get('speech-pitch-value').textContent = settings.pitch.toFixed(1);
  }
  function stop() { pending.clear(); try { synth.cancel(); } catch {} }
  function loadVoices() {
    try {
      voices = Array.from(new Map(synth.getVoices().filter(v => v.localService && v.lang.replace(/_/g, '-').toLowerCase() === 'zh-cn').map(v => [voiceKey(v), v])).values());
      select.replaceChildren();
      select.disabled = get('speech-preview').disabled = !voices.length;
      if (!voices.length) {
        select.add(new Option('暂无本地中文音色', ''));
        status.textContent = '未检测到本地 zh-CN 音色，请检查系统语音设置。';
        return;
      }
      voices.forEach(v => select.add(new Option(v.name, voiceKey(v))));
      const preferred = voices.find(v => voiceKey(v) === settings.voice);
      select.value = voiceKey(preferred || voices.find(v => v.default) || voices[0]);
      if (!settings.voice) { settings.voice = select.value; save(); }
      status.textContent = settings.voice !== select.value ? '原音色暂不可用，暂用列表中的替代音色。' : '';
    } catch {
      voices = []; select.replaceChildren(new Option('语音列表读取失败', ''));
      select.disabled = get('speech-preview').disabled = true;
      status.textContent = '语音服务暂不可用，任务功能不受影响。';
    }
  }
  function speakCompletion(preview = false) {
    if (!preview && !settings.enabled) return;
    const voice = voices.find(v => voiceKey(v) === select.value);
    if (!voice) { status.textContent = '没有可用的本地中文音色。'; return; }
    try {
      const utterance = new SpeechSynthesisUtterance(nextMessage());
      utterance.voice = voice; utterance.lang = 'zh-CN';
      utterance.rate = settings.rate; utterance.pitch = settings.pitch;
      pending.add(utterance);
      utterance.onend = () => { pending.delete(utterance); };
      utterance.onerror = event => {
        if (!pending.delete(utterance)) return;
        if (!['canceled','interrupted'].includes(event.error)) status.textContent = '未能播报，请换一个音色或点击试听后再试。';
      };
      status.textContent = '';
      // 使用浏览器队列，每个完成任务都播报，不打断上一条。
      try { synth.speak(utterance); } catch (error) { pending.delete(utterance); throw error; }
    } catch { status.textContent = '语音服务暂不可用，任务操作不受影响。'; }
  }
  toggle.addEventListener('click', () => { settings.enabled = !settings.enabled; if (!settings.enabled) stop(); save(); update(); });
  select.addEventListener('change', () => { settings.voice = select.value; stop(); save(); status.textContent = ''; });
  rate.addEventListener('input', () => { settings.rate = clamp(Number(rate.value), .5, 2); update(); save(); });
  pitch.addEventListener('input', () => { settings.pitch = clamp(Number(pitch.value), 0, 2); update(); save(); });
  get('speech-preview').addEventListener('click', () => speakCompletion(true));
  synth.addEventListener('voiceschanged', loadVoices);
  window.addEventListener('focus', loadVoices);
  window.addEventListener('pagehide', stop);
  get('logout')?.addEventListener('click', stop);
  update(); controls.hidden = false; loadVoices();
  // 原任务逻辑在后端保存成功后更新 completed 类；无需修改业务代码。
  const list = get('task-list');
  if (list) new MutationObserver(records => {
    const completed = new Set();
    records.forEach(record => {
      const row = record.target;
      if (row instanceof HTMLElement && row.matches('.task') &&
        !(record.oldValue || '').split(/\s+/).includes('completed') && row.classList.contains('completed')) completed.add(row);
    });
    completed.forEach(() => speakCompletion());
  }).observe(list, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
})();
