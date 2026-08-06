/* ============================================================================
   AI Talk — a full OpenAI client that runs entirely in the browser.

   The API key never leaves this device except to go straight to OpenAI. There
   is no server in the middle, because there is no server at all: this is a
   static page on GitHub Pages.
============================================================================ */

const API = 'https://api.openai.com/v1';
const KEY_STORE = 'colton_aitalk_key';
const DATA_STORE = 'colton_aitalk_data';

const $ = id => document.getElementById(id);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const uid = () => Math.random().toString(36).slice(2, 10);

/* --------------------------------- state ---------------------------------- */
let apiKey = '';
let models = { chat: [], image: [], tts: [], stt: [] };
let store = { chats: [], currentId: null, settings: {} };
let attachments = [];          // [{ name, dataUrl }]
let abortCtl = null;
let recorder = null, recChunks = [];

const DEFAULTS = {
  system: 'You are a sharp, friendly assistant. Be concise unless asked for detail.',
  temperature: null,           // null = do not send the parameter at all
  maxTokens: null,
  ttsVoice: 'alloy',
  imageSize: '1024x1024',
  showUsage: true,
};

/* Preference order when guessing a default chat model. Anything not on this
   list still works — we fall back to whatever the account actually has. */
const CHAT_PREF = ['gpt-5', 'gpt-4.1', 'gpt-4o', 'o4', 'o3', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5'];

/* ------------------------------- persistence ------------------------------ */
function loadStore() {
  try {
    const raw = localStorage.getItem(DATA_STORE);
    if (raw) store = JSON.parse(raw);
  } catch (e) { /* corrupt data — start fresh */ }
  if (!Array.isArray(store.chats)) store.chats = [];
  store.settings = Object.assign({}, DEFAULTS, store.settings || {});
}
function saveStore() {
  try { localStorage.setItem(DATA_STORE, JSON.stringify(store)); }
  catch (e) { toast('Could not save — browser storage is full.'); }
}

const currentChat = () => store.chats.find(c => c.id === store.currentId);

function newChat(model) {
  const c = {
    id: uid(),
    title: 'New chat',
    model: model || (models.chat[0] && models.chat[0].id) || 'gpt-4o-mini',
    system: store.settings.system,
    messages: [],
    created: Date.now(),
  };
  store.chats.unshift(c);
  store.currentId = c.id;
  saveStore();
  return c;
}

/* --------------------------------- toasts --------------------------------- */
function toast(text, kind = '') {
  const t = el('div', 'toast ' + kind, text);
  $('toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 350); }, 4500);
}

/* ------------------------------- markdown --------------------------------- */
/* Quotes matter as much as angle brackets: the fence language below is
   interpolated into an attribute, so an unescaped " would break out of it. */
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderMarkdown(src) {
  const blocks = String(src).split(/```/);
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    if (i % 2 === 1) {                                  // inside a fence
      const nl = blocks[i].indexOf('\n');
      const lang = nl > -1 ? blocks[i].slice(0, nl).trim() : '';
      const code = nl > -1 ? blocks[i].slice(nl + 1) : blocks[i];
      html += `<pre data-lang="${esc(lang)}"><button class="copyCode">copy</button><code>${esc(code.replace(/\n$/, ''))}</code></pre>`;
    } else {
      html += inline(blocks[i]);
    }
  }
  return html;
}

function inline(text) {
  let t = esc(text);
  t = t.replace(/`([^`\n]+)`/g, (m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
       .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
       .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
       .replace(/^### (.*)$/gm, '<h3>$1</h3>')
       .replace(/^## (.*)$/gm, '<h2>$1</h2>')
       .replace(/^# (.*)$/gm, '<h1>$1</h1>');
  // group consecutive bullet / numbered lines into real lists
  t = t.replace(/(?:^[-*+] .*(?:\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[-*+] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  t = t.replace(/(?:^\d+\. .*(?:\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  t = t.replace(/^---$/gm, '<hr>');
  return t.split(/\n{2,}/).map(p => {
    const s = p.trim();
    if (!s) return '';
    if (/^<(h\d|ul|ol|hr|pre|blockquote)/.test(s)) return s;
    return `<p>${s.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

/* ------------------------------- API layer -------------------------------- */
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${apiKey}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* not json */ }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res;
}

/** Sort the account's models into the four buckets the UI cares about. */
function classify(list) {
  const out = { chat: [], image: [], tts: [], stt: [] };
  for (const m of list) {
    const id = m.id;
    if (/embedding|moderation|similarity|search-|edit-|davinci|babbage|codex/.test(id)) continue;
    if (/^(dall-e|gpt-image)/.test(id)) { out.image.push(m); continue; }
    if (/tts/.test(id)) { out.tts.push(m); continue; }
    if (/whisper|transcribe/.test(id)) { out.stt.push(m); continue; }
    if (/realtime|audio-preview/.test(id)) continue;
    if (/^(gpt|o[1-9]|chatgpt)/.test(id)) out.chat.push(m);
  }
  const byNew = (a, b) => (b.created || 0) - (a.created || 0);
  out.image.sort(byNew); out.tts.sort(byNew); out.stt.sort(byNew);
  out.chat.sort((a, b) => {
    const rank = x => { const i = CHAT_PREF.findIndex(p => x.id.startsWith(p)); return i === -1 ? 99 : i; };
    return rank(a) - rank(b) || byNew(a, b);
  });
  return out;
}

async function loadModels() {
  try {
    const res = await api('/models');
    const json = await res.json();
    models = classify(json.data || []);
    if (!models.chat.length) throw new Error('No chat models available on this key.');
  } catch (e) {
    toast('Could not list models (' + e.message + '). Using a manual list.', 'warn');
    models = {
      chat: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'].map(id => ({ id })),
      image: [{ id: 'dall-e-3' }], tts: [{ id: 'tts-1' }], stt: [{ id: 'whisper-1' }],
    };
  }
  renderModelPicker();
}

function renderModelPicker() {
  const sel = $('modelSelect');
  sel.innerHTML = '';
  for (const m of models.chat) {
    const o = el('option', null, m.id);
    o.value = m.id;
    sel.appendChild(o);
  }
  const chat = currentChat();
  if (chat) {
    if (!models.chat.some(m => m.id === chat.model)) {
      const o = el('option', null, chat.model + ' (not listed)');
      o.value = chat.model; sel.appendChild(o);
    }
    sel.value = chat.model;
  }
}

/* --------------------------- chat completions ----------------------------- */
function buildMessages(chat) {
  const out = [];
  if (chat.system && chat.system.trim()) out.push({ role: 'system', content: chat.system });
  for (const m of chat.messages) {
    if (m.role === 'user' && m.images && m.images.length) {
      out.push({
        role: 'user',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.images.map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      });
    } else if (m.content) {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

/**
 * Stream a reply. Optional parameters are attempted once; if the model
 * rejects them we retry with the bare minimum rather than failing outright.
 */
async function streamReply(chat, onDelta, onUsage) {
  const st = store.settings;
  const base = { model: chat.model, messages: buildMessages(chat), stream: true };
  const extras = {};
  if (st.temperature != null) extras.temperature = st.temperature;
  if (st.maxTokens) extras.max_completion_tokens = st.maxTokens;
  if (st.showUsage) extras.stream_options = { include_usage: true };

  const attempt = async body => {
    abortCtl = new AbortController();
    return api('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortCtl.signal,
    });
  };

  let res;
  try {
    res = await attempt({ ...base, ...extras });
  } catch (e) {
    if (e.status === 400 && Object.keys(extras).length) {
      toast('This model refused an optional setting — retrying without it.');
      res = await attempt(base);
    } else throw e;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      let j; try { j = JSON.parse(payload); } catch (e) { continue; }
      const delta = j.choices && j.choices[0] && j.choices[0].delta;
      if (delta && delta.content) onDelta(delta.content);
      if (j.usage && onUsage) onUsage(j.usage);
    }
  }
}

/* ------------------------------- rendering -------------------------------- */
function renderChatList() {
  const list = $('chatList');
  list.innerHTML = '';
  for (const c of store.chats) {
    const row = el('div', 'chatRow' + (c.id === store.currentId ? ' active' : ''));
    row.appendChild(el('div', 'chatName', c.title));
    row.appendChild(el('div', 'chatMeta', c.model));
    row.addEventListener('click', () => { store.currentId = c.id; saveStore(); renderAll(); closeSidebar(); });
    const del = el('button', 'chatDel', '×');
    del.title = 'Delete conversation';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete "${c.title}"?`)) return;
      store.chats = store.chats.filter(x => x.id !== c.id);
      if (store.currentId === c.id) store.currentId = store.chats[0] ? store.chats[0].id : null;
      if (!store.chats.length) newChat();
      saveStore(); renderAll();
    });
    row.appendChild(del);
    list.appendChild(row);
  }
}

function messageNode(m, index) {
  const wrap = el('div', 'msg ' + m.role);
  const av = el('div', 'avatar', m.role === 'user' ? '🧑' : m.role === 'system' ? '⚙️' : '🤖');
  wrap.appendChild(av);
  const body = el('div', 'bubble');

  if (m.images && m.images.length) {
    const strip = el('div', 'imgStrip');
    for (const src of m.images) {
      const i = document.createElement('img');
      i.src = src; i.loading = 'lazy';
      strip.appendChild(i);
    }
    body.appendChild(strip);
  }
  if (m.image) {                                     // a generated image
    const i = document.createElement('img');
    i.src = m.image; i.className = 'genImg'; i.loading = 'lazy';
    body.appendChild(i);
  }

  const text = el('div', 'text');
  text.innerHTML = m.role === 'assistant' ? renderMarkdown(m.content || '') : esc(m.content || '').replace(/\n/g, '<br>');
  body.appendChild(text);

  const tools = el('div', 'msgTools');
  const copy = el('button', null, 'copy');
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(m.content || '').then(() => toast('Copied.'));
  });
  tools.appendChild(copy);
  if (m.role === 'assistant') {
    const speak = el('button', null, '🔊 speak');
    speak.addEventListener('click', () => speakText(m.content, speak));
    tools.appendChild(speak);
    const again = el('button', null, '↻ retry');
    again.addEventListener('click', () => regenerate(index));
    tools.appendChild(again);
  }
  const drop = el('button', null, 'delete');
  drop.addEventListener('click', () => {
    const chat = currentChat();
    chat.messages.splice(index, 1);
    saveStore(); renderMessages();
  });
  tools.appendChild(drop);
  body.appendChild(tools);

  if (m.usage) body.appendChild(el('div', 'usage',
    `${m.usage.prompt_tokens} in · ${m.usage.completion_tokens} out · ${m.usage.total_tokens} total`));

  wrap.appendChild(body);
  return wrap;
}

function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  const chat = currentChat();
  if (!chat) return;
  $('chatTitle').textContent = chat.title;
  if (!chat.messages.length) {
    const e = el('div', 'empty');
    e.innerHTML = `<div class="bigIcon">🤖</div><h2>AI Talk</h2>
      <p>Model: <b>${esc(chat.model)}</b></p>
      <p class="dim">Ask anything. Attach an image to have it looked at, hit the mic to
      talk instead of type, or type <code>/image a red panda astronaut</code> to draw something.</p>`;
    box.appendChild(e);
    return;
  }
  chat.messages.forEach((m, i) => box.appendChild(messageNode(m, i)));
  wireCopyButtons(box);
  box.scrollTop = box.scrollHeight;
}

function wireCopyButtons(scope) {
  scope.querySelectorAll('.copyCode').forEach(b => {
    if (b.dataset.wired) return;
    b.dataset.wired = '1';
    b.addEventListener('click', () => {
      const code = b.parentElement.querySelector('code');
      navigator.clipboard.writeText(code.textContent).then(() => {
        b.textContent = 'copied'; setTimeout(() => { b.textContent = 'copy'; }, 1200);
      });
    });
  });
}

function renderAll() {
  renderChatList();
  renderMessages();
  renderModelPicker();
}

/* --------------------------------- sending -------------------------------- */
async function send() {
  const chat = currentChat();
  if (!chat) return;
  const input = $('input');
  const text = input.value.trim();
  if (!text && !attachments.length) return;

  if (text.startsWith('/image ')) { input.value = ''; return generateImage(text.slice(7).trim()); }

  const msg = { role: 'user', content: text };
  if (attachments.length) msg.images = attachments.map(a => a.dataUrl);
  chat.messages.push(msg);
  if (chat.title === 'New chat' && text) chat.title = text.slice(0, 42);
  attachments = [];
  renderAttachments();
  input.value = '';
  input.style.height = 'auto';
  saveStore();
  renderMessages();
  renderChatList();

  const reply = { role: 'assistant', content: '' };
  chat.messages.push(reply);
  const box = $('messages');
  const node = messageNode(reply, chat.messages.length - 1);
  box.appendChild(node);
  const textEl = node.querySelector('.text');
  textEl.innerHTML = '<span class="cursor"></span>';
  box.scrollTop = box.scrollHeight;

  setBusy(true);
  try {
    await streamReply(chat, chunk => {
      reply.content += chunk;
      textEl.innerHTML = renderMarkdown(reply.content) + '<span class="cursor"></span>';
      wireCopyButtons(textEl);
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
      if (nearBottom) box.scrollTop = box.scrollHeight;
    }, usage => { reply.usage = usage; });
  } catch (e) {
    if (e.name === 'AbortError') reply.content += '\n\n_(stopped)_';
    else { reply.content = '⚠️ ' + e.message; toast(e.message, 'warn'); }
  }
  setBusy(false);
  if (!reply.content) chat.messages.pop();
  saveStore();
  renderMessages();
}

function setBusy(b) {
  $('sendBtn').style.display = b ? 'none' : '';
  $('stopBtn').style.display = b ? '' : 'none';
  $('input').disabled = false;
}

async function regenerate(index) {
  const chat = currentChat();
  chat.messages = chat.messages.slice(0, index);
  saveStore();
  renderMessages();
  const reply = { role: 'assistant', content: '' };
  chat.messages.push(reply);
  const box = $('messages');
  const node = messageNode(reply, chat.messages.length - 1);
  box.appendChild(node);
  const textEl = node.querySelector('.text');
  setBusy(true);
  try {
    await streamReply(chat, c => {
      reply.content += c;
      textEl.innerHTML = renderMarkdown(reply.content) + '<span class="cursor"></span>';
      box.scrollTop = box.scrollHeight;
    }, u => { reply.usage = u; });
  } catch (e) {
    reply.content = '⚠️ ' + e.message;
  }
  setBusy(false);
  saveStore();
  renderMessages();
}

/* ------------------------------ image drawing ----------------------------- */
async function generateImage(prompt) {
  if (!prompt) return toast('Give it something to draw.');
  const chat = currentChat();
  const model = (models.image[0] && models.image[0].id) || 'dall-e-3';
  chat.messages.push({ role: 'user', content: '/image ' + prompt });
  const holder = { role: 'assistant', content: `🎨 Drawing with ${model}…` };
  chat.messages.push(holder);
  renderMessages();
  setBusy(true);
  try {
    const res = await api('/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, n: 1, size: store.settings.imageSize }),
    });
    const j = await res.json();
    const d = j.data && j.data[0];
    if (!d) throw new Error('No image came back.');
    holder.image = d.url || ('data:image/png;base64,' + d.b64_json);
    holder.content = d.revised_prompt || prompt;
  } catch (e) {
    holder.content = '⚠️ ' + e.message;
    toast(e.message, 'warn');
  }
  setBusy(false);
  saveStore();
  renderMessages();
}

/* -------------------------------- speech ---------------------------------- */
let audioEl = null;
async function speakText(text, btn) {
  if (!text) return;
  if (audioEl && !audioEl.paused) { audioEl.pause(); audioEl = null; btn.textContent = '🔊 speak'; return; }
  const model = (models.tts[0] && models.tts[0].id) || 'tts-1';
  btn.textContent = '…';
  try {
    const res = await api('/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice: store.settings.ttsVoice, input: text.slice(0, 4000) }),
    });
    const buf = await res.arrayBuffer();
    audioEl = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' })));
    audioEl.onended = () => { btn.textContent = '🔊 speak'; };
    await audioEl.play();
    btn.textContent = '⏸ stop';
  } catch (e) {
    toast(e.message, 'warn');
    btn.textContent = '🔊 speak';
  }
}

async function toggleMic() {
  const btn = $('micBtn');
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast('This browser cannot record audio.', 'warn');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      btn.classList.remove('rec');
      btn.textContent = '🎙️';
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size < 900) return;
      const model = (models.stt[0] && models.stt[0].id) || 'whisper-1';
      toast('Transcribing…');
      try {
        const fd = new FormData();
        fd.append('file', blob, 'speech.webm');
        fd.append('model', model);
        const res = await api('/audio/transcriptions', { method: 'POST', body: fd });
        const j = await res.json();
        $('input').value = ($('input').value + ' ' + (j.text || '')).trim();
        autoGrow();
        $('input').focus();
      } catch (e) { toast(e.message, 'warn'); }
    };
    recorder.start();
    btn.classList.add('rec');
    btn.textContent = '⏹️';
  } catch (e) {
    toast('Microphone blocked: ' + e.message, 'warn');
  }
}

/* ------------------------------ attachments ------------------------------- */
function renderAttachments() {
  const box = $('attachPreview');
  box.innerHTML = '';
  box.style.display = attachments.length ? 'flex' : 'none';
  attachments.forEach((a, i) => {
    const chip = el('div', 'chip');
    const img = document.createElement('img');
    img.src = a.dataUrl;
    chip.appendChild(img);
    const x = el('button', null, '×');
    x.addEventListener('click', () => { attachments.splice(i, 1); renderAttachments(); });
    chip.appendChild(x);
    box.appendChild(chip);
  });
}

function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) { toast('Only images can be attached.'); continue; }
    if (f.size > 18 * 1024 * 1024) { toast(`${f.name} is too big (18 MB max).`, 'warn'); continue; }
    const r = new FileReader();
    r.onload = () => { attachments.push({ name: f.name, dataUrl: r.result }); renderAttachments(); };
    r.readAsDataURL(f);
  }
}

/* -------------------------------- settings -------------------------------- */
function openModal(title, build) {
  $('modalTitle').textContent = title;
  const b = $('modalBody');
  b.innerHTML = '';
  build(b);
  $('modalBack').classList.add('show');
}
const closeModal = () => $('modalBack').classList.remove('show');

function openSystemEditor() {
  const chat = currentChat();
  openModal('⚙️ Persona for this chat', body => {
    body.appendChild(el('p', 'note', 'The system prompt steers every reply in this conversation.'));
    const ta = el('textarea', 'bigInput');
    ta.value = chat.system || '';
    ta.rows = 8;
    body.appendChild(ta);
    const presets = el('div', 'presets');
    const P = {
      'Default': DEFAULTS.system,
      'Blunt expert': 'You are a blunt domain expert. No hedging, no filler, no apologies. Lead with the answer.',
      'Socratic tutor': 'You are a patient tutor. Ask one guiding question at a time and never just give the answer.',
      'Code reviewer': 'You are a meticulous senior engineer. Point out bugs, edge cases and simpler alternatives. Show code.',
      'Storyteller': 'You are a vivid storyteller. Rich sensory detail, strong verbs, no purple prose.',
    };
    for (const [k, v] of Object.entries(P)) {
      const b2 = el('button', 'pill', k);
      b2.addEventListener('click', () => { ta.value = v; });
      presets.appendChild(b2);
    }
    body.appendChild(presets);
    const save = el('button', 'wide', 'Save');
    save.addEventListener('click', () => { chat.system = ta.value; saveStore(); closeModal(); toast('Persona updated.'); });
    body.appendChild(save);
  });
}

function openSettings() {
  const st = store.settings;
  openModal('🎛️ Settings', body => {
    const field = (label, node, hint) => {
      const w = el('div', 'field');
      w.appendChild(el('label', null, label));
      w.appendChild(node);
      if (hint) w.appendChild(el('div', 'note', hint));
      body.appendChild(w);
      return node;
    };

    const temp = el('input'); temp.type = 'range'; temp.min = '0'; temp.max = '2'; temp.step = '0.1';
    temp.value = st.temperature == null ? '1' : String(st.temperature);
    const tempOn = el('input'); tempOn.type = 'checkbox'; tempOn.checked = st.temperature != null;
    const tempRow = el('div', 'row2');
    tempRow.appendChild(tempOn); tempRow.appendChild(temp);
    const tempVal = el('span', 'val', temp.value);
    tempRow.appendChild(tempVal);
    temp.addEventListener('input', () => { tempVal.textContent = temp.value; tempOn.checked = true; });
    field('Temperature', tempRow, 'Off by default — several newer models reject this parameter.');

    const maxT = el('input'); maxT.type = 'number'; maxT.min = '16'; maxT.placeholder = 'unlimited';
    maxT.value = st.maxTokens || '';
    field('Max output tokens', maxT, 'Leave blank to let the model decide.');

    const voice = el('select');
    for (const v of ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']) {
      const o = el('option', null, v); o.value = v; voice.appendChild(o);
    }
    voice.value = st.ttsVoice;
    field('Speech voice', voice);

    const size = el('select');
    for (const v of ['1024x1024', '1024x1536', '1536x1024', '512x512']) {
      const o = el('option', null, v); o.value = v; size.appendChild(o);
    }
    size.value = st.imageSize;
    field('Image size', size);

    const usage = el('input'); usage.type = 'checkbox'; usage.checked = !!st.showUsage;
    const uRow = el('div', 'row2'); uRow.appendChild(usage); uRow.appendChild(el('span', null, 'Show token counts'));
    field('Usage', uRow);

    const save = el('button', 'wide', 'Save settings');
    save.addEventListener('click', () => {
      st.temperature = tempOn.checked ? parseFloat(temp.value) : null;
      st.maxTokens = maxT.value ? parseInt(maxT.value, 10) : null;
      st.ttsVoice = voice.value;
      st.imageSize = size.value;
      st.showUsage = usage.checked;
      saveStore(); closeModal(); toast('Saved.');
    });
    body.appendChild(save);

    const forget = el('button', 'wide ghost', 'Forget my API key');
    forget.addEventListener('click', () => {
      if (!confirm('Remove the stored key from this browser?')) return;
      localStorage.removeItem(KEY_STORE);
      location.reload();
    });
    body.appendChild(forget);

    const wipe = el('button', 'wide ghost', 'Delete all conversations');
    wipe.addEventListener('click', () => {
      if (!confirm('Delete every conversation on this device?')) return;
      store.chats = []; store.currentId = null; newChat(); saveStore(); closeModal(); renderAll();
    });
    body.appendChild(wipe);
  });
}

function exportChat() {
  const chat = currentChat();
  if (!chat) return;
  const lines = [`# ${chat.title}`, `Model: ${chat.model}`, ''];
  if (chat.system) lines.push(`> System: ${chat.system}`, '');
  for (const m of chat.messages) lines.push(`**${m.role}:**`, m.content || '', '');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = chat.title.replace(/[^\w\- ]/g, '').slice(0, 40) + '.md';
  a.click();
}

/* ------------------------------- sidebar ---------------------------------- */
const openSidebar = () => document.body.classList.add('sbOpen');
const closeSidebar = () => document.body.classList.remove('sbOpen');

/* -------------------------------- composer -------------------------------- */
function autoGrow() {
  const i = $('input');
  i.style.height = 'auto';
  i.style.height = Math.min(190, i.scrollHeight) + 'px';
}

/* --------------------------------- setup ---------------------------------- */
async function tryKey(key) {
  const res = await fetch(API + '/models', { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 401) throw new Error('That key was rejected. Check you copied all of it.');
  if (!res.ok) {
    // A key with narrow scopes may not be allowed to list models — that is
    // fine, chat may still work. Only a 401 really means "bad key".
    if (res.status === 403) return;
    throw new Error(`OpenAI replied ${res.status}.`);
  }
}

function showSetup() {
  $('setup').classList.add('show');
  $('keyInput').focus();
}

async function boot() {
  loadStore();
  apiKey = localStorage.getItem(KEY_STORE) || '';

  $('saveKeyBtn').addEventListener('click', async () => {
    const k = $('keyInput').value.trim();
    const err = $('setupErr');
    err.textContent = '';
    if (!k.startsWith('sk-')) { err.textContent = 'OpenAI keys start with "sk-".'; return; }
    $('saveKeyBtn').disabled = true;
    $('saveKeyBtn').textContent = 'Checking…';
    try {
      await tryKey(k);
      apiKey = k;
      if ($('rememberKey').checked) localStorage.setItem(KEY_STORE, k);
      $('setup').classList.remove('show');
      await start();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      $('saveKeyBtn').disabled = false;
      $('saveKeyBtn').textContent = 'Start talking';
    }
  });
  $('keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('saveKeyBtn').click(); });

  // composer + chrome
  $('sendBtn').addEventListener('click', send);
  $('stopBtn').addEventListener('click', () => { if (abortCtl) abortCtl.abort(); });
  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); }
  });
  $('attachBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('micBtn').addEventListener('click', toggleMic);
  $('imgBtn').addEventListener('click', () => {
    const p = prompt('Describe the image you want:');
    if (p) generateImage(p.trim());
  });
  $('newChatBtn').addEventListener('click', () => { newChat($('modelSelect').value); renderAll(); closeSidebar(); $('input').focus(); });
  $('systemBtn').addEventListener('click', openSystemEditor);
  $('settingsBtn').addEventListener('click', openSettings);
  $('exportBtn').addEventListener('click', exportChat);
  $('menuBtn').addEventListener('click', openSidebar);
  $('scrim').addEventListener('click', closeSidebar);
  $('modalClose').addEventListener('click', closeModal);
  $('modalBack').addEventListener('click', e => { if (e.target === $('modalBack')) closeModal(); });
  $('modelSelect').addEventListener('change', () => {
    const c = currentChat();
    if (c) { c.model = $('modelSelect').value; saveStore(); renderChatList(); }
  });
  $('refreshModels').addEventListener('click', async () => { toast('Refreshing models…'); await loadModels(); toast('Models updated.'); });

  // paste + drag-drop images
  addEventListener('paste', e => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { addFiles(files); e.preventDefault(); }
  });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  if (apiKey) { $('setup').classList.remove('show'); await start(); }
  else showSetup();
}

async function start() {
  $('shell').style.display = 'flex';
  await loadModels();
  if (!store.chats.length) newChat();
  if (!store.currentId || !currentChat()) store.currentId = store.chats[0].id;
  renderAll();
  $('input').focus();
}

boot();
