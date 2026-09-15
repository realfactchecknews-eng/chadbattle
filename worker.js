// CHADBATTLE API: рейтинг Elo, батлы, новости, заявки, админка (заголовок X-Admin-Key)
const H = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-admin-key',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...H, 'content-type': 'application/json' } });
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const now = () => Math.floor(Date.now() / 1000);
const K = 32;
const MAX_PHOTO = 900_000; // data URL, клиент ужимает до 800px

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const ipHash = async (req, env) => (await hmac(env.ADMIN_KEY, 'ip:' + (req.headers.get('cf-connecting-ip') || ''))).slice(0, 32);

const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ы:'y',э:'e',ю:'yu',я:'ya' };
const slugify = s => [...s.toLowerCase()].map(c => TR[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chad';

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const RANK_SQL = `SELECT id, slug, name, title, kind, elo, wins, battles, prev_rank,
  (photo <> '') AS has_photo, ROW_NUMBER() OVER (ORDER BY elo DESC) AS rank FROM persons`;

async function uniqueSlug(env, base, id = 0) {
  let slug = base, i = 1;
  while (await env.DB.prepare('SELECT 1 FROM persons WHERE slug=? AND id<>?').bind(slug, id).first()) slug = `${base}-${++i}`;
  return slug;
}

async function api(req, env, url) {
  const p = url.pathname, m = req.method;
  const body = m === 'POST' ? await req.json().catch(() => ({})) : null;

  if (p === '/api/rankings') {
    const { results } = await env.DB.prepare(RANK_SQL + ' ORDER BY elo DESC').all();
    return json(results);
  }
  if (p.startsWith('/api/person/')) {
    const slug = decodeURIComponent(p.slice(12));
    const r = await env.DB.prepare(`SELECT r.*, p.bio FROM (${RANK_SQL}) r JOIN persons p ON p.id=r.id WHERE r.slug=?`).bind(slug).first();
    return r ? json(r) : json({ error: 'Не найден' }, 404);
  }
  if (p.startsWith('/api/photo/')) {
    const r = await env.DB.prepare('SELECT photo FROM persons WHERE id=?').bind(+p.slice(11)).first();
    if (!r?.photo) return new Response('', { status: 404, headers: H });
    if (/^https?:\/\//.test(r.photo)) return Response.redirect(r.photo, 302);
    const [head, b64] = r.photo.split(',');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { ...H, 'content-type': head.slice(5).split(';')[0], 'cache-control': 'public, max-age=3600' } });
  }
  if (p === '/api/news') {
    const { results } = await env.DB.prepare('SELECT * FROM news ORDER BY created DESC LIMIT 50').all();
    return json(results);
  }
  if (p === '/api/battle') {
    const { results: all } = await env.DB.prepare('SELECT id FROM persons ORDER BY elo DESC').all();
    if (all.length < 2) return json({ error: 'Мало участников' }, 400);
    // соперник из ±8 позиций — батлы между близкими по уровню интереснее и точнее для Elo
    const i = Math.floor(Math.random() * all.length);
    const pool = all.slice(Math.max(0, i - 8), i + 9).filter((_, k, arr) => arr[k].id !== all[i].id);
    const b = pool[Math.floor(Math.random() * pool.length)];
    const [x, y] = Math.random() < 0.5 ? [all[i].id, b.id] : [b.id, all[i].id];
    const exp = now() + 600;
    const msg = `${x}.${y}.${exp}.${crypto.randomUUID()}`;
    const token = `${msg}.${await hmac(env.ADMIN_KEY, 'tok:' + msg)}`;
    const { results } = await env.DB.prepare(`SELECT * FROM (${RANK_SQL}) WHERE id IN (?, ?)`).bind(x, y).all();
    return json({ token, pair: [x, y].map(id => results.find(r => r.id === id)) });
  }
  if (p === '/api/vote' && m === 'POST') {
    const parts = String(body.token || '').split('.');
    if (parts.length !== 5) return json({ error: 'Плохой токен' }, 400);
    const [a, b, exp] = parts.map(Number), msg = parts.slice(0, 4).join('.');
    if (parts[4] !== await hmac(env.ADMIN_KEY, 'tok:' + msg) || exp < now()) return json({ error: 'Батл устарел' }, 400);
    const w = +body.winner;
    if (w !== a && w !== b) return json({ error: 'Плохой выбор' }, 400);
    const ip = await ipHash(req, env);
    const c = await env.DB.prepare('SELECT COUNT(*) n FROM votes WHERE ip=? AND created>?').bind(ip, now() - 3600).first();
    if (c.n >= 60) return json({ error: 'Слишком много голосов, передохни час' }, 429);
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO votes (tok, ip, created) VALUES (?,?,?)').bind(parts[4], ip, now()).run();
    if (!ins.meta.changes) return json({ error: 'Уже проголосовано' }, 409);
    const l = w === a ? b : a;
    const { results } = await env.DB.prepare('SELECT id, elo FROM persons WHERE id IN (?,?)').bind(w, l).all();
    const W = results.find(r => r.id === w), L = results.find(r => r.id === l);
    if (!W || !L) return json({ error: 'Участник удалён' }, 404);
    const d = K * (1 - 1 / (1 + 10 ** ((L.elo - W.elo) / 400)));
    await env.DB.batch([
      env.DB.prepare('UPDATE persons SET elo=elo+?, wins=wins+1, battles=battles+1 WHERE id=?').bind(d, w),
      env.DB.prepare('UPDATE persons SET elo=elo-?, battles=battles+1 WHERE id=?').bind(d, l),
    ]);
    return json({ delta: Math.round(d * 10) / 10 });
  }
  if (p === '/api/apply' && m === 'POST') {
    const name = str(body.name, 60), contact = str(body.contact, 80), bio = str(body.bio, 600), photo = String(body.photo || '');
    if (!name || !contact) return json({ error: 'Заполни имя и контакт' }, 400);
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > MAX_PHOTO) return json({ error: 'Нужно фото до 600 КБ' }, 400);
    const ip = await ipHash(req, env);
    const c = await env.DB.prepare('SELECT COUNT(*) n FROM applications WHERE ip=? AND created>?').bind(ip, now() - 86400).first();
    if (c.n >= 3) return json({ error: 'Не больше 3 заявок в сутки' }, 429);
    await env.DB.prepare('INSERT INTO applications (name, contact, bio, photo, ip) VALUES (?,?,?,?,?)').bind(name, contact, bio, photo, ip).run();
    return json({ ok: true });
  }

  // ---- админка ----
  if (p.startsWith('/api/admin/')) {
    if (!env.ADMIN_KEY || req.headers.get('x-admin-key') !== env.ADMIN_KEY) return json({ error: 'Неверный ключ' }, 401);
    const [, , , what, id, action] = p.split('/');
    if (what === 'applications' && m === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, name, contact, bio, photo, created FROM applications ORDER BY created DESC').all();
      return json(results);
    }
    if (what === 'applications' && action === 'approve') {
      const a = await env.DB.prepare('SELECT * FROM applications WHERE id=?').bind(+id).first();
      if (!a) return json({ error: 'Нет заявки' }, 404);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO persons (slug, name, title, bio, photo, kind) VALUES (?,?,?,?,?,'user')")
          .bind(await uniqueSlug(env, slugify(a.name)), a.name, str(body.title, 40) || 'Новичок', a.bio, a.photo),
        env.DB.prepare('DELETE FROM applications WHERE id=?').bind(+id),
      ]);
      return json({ ok: true });
    }
    if (what === 'applications' && m === 'DELETE') {
      await env.DB.prepare('DELETE FROM applications WHERE id=?').bind(+id).run();
      return json({ ok: true });
    }
    if (what === 'person' && m === 'POST') {
      const name = str(body.name, 60);
      if (!name) return json({ error: 'Нужно имя' }, 400);
      const photo = String(body.photo || '');
      if (photo.length > MAX_PHOTO) return json({ error: 'Фото слишком большое' }, 400);
      const pid = +body.id || 0;
      const slug = await uniqueSlug(env, slugify(str(body.slug, 60) || name), pid);
      const f = [slug, name, str(body.title, 40), str(body.bio, 3000), photo, body.kind === 'user' ? 'user' : 'media'];
      if (pid) await env.DB.prepare("UPDATE persons SET slug=?, name=?, title=?, bio=?, photo=COALESCE(NULLIF(?, ''), photo), kind=? WHERE id=?").bind(...f, pid).run();
      else await env.DB.prepare('INSERT INTO persons (slug, name, title, bio, photo, kind) VALUES (?,?,?,?,?,?)').bind(...f).run();
      return json({ ok: true, slug });
    }
    if (what === 'person' && m === 'DELETE') {
      await env.DB.prepare('DELETE FROM persons WHERE id=?').bind(+id).run();
      return json({ ok: true });
    }
    if (what === 'news' && m === 'POST') {
      const title = str(body.title, 140);
      if (!title) return json({ error: 'Нужен заголовок' }, 400);
      await env.DB.prepare('INSERT INTO news (title, body, breaking) VALUES (?,?,?)').bind(title, str(body.body, 5000), body.breaking ? 1 : 0).run();
      return json({ ok: true });
    }
    if (what === 'news' && m === 'DELETE') {
      await env.DB.prepare('DELETE FROM news WHERE id=?').bind(+id).run();
      return json({ ok: true });
    }
    if (what === 'snapshot' && m === 'POST') return json(await snapshot(env));
  }
  return json({ error: 'Not found' }, 404);
}

async function snapshot(env) {
  await env.DB.batch([
    env.DB.prepare('UPDATE persons SET prev_rank=(SELECT r FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY elo DESC) r FROM persons) t WHERE t.id=persons.id)'),
    env.DB.prepare('DELETE FROM votes WHERE created<?').bind(now() - 86400 * 2),
  ]);
  return { ok: true };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: H });
    try {
      return await api(req, env, new URL(req.url));
    } catch (e) {
      return json({ error: 'Ошибка сервера' }, 500);
    }
  },
  scheduled: (_, env, ctx) => ctx.waitUntil(snapshot(env)),
};
