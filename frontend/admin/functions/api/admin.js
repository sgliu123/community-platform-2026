// 后台 API：模板下载 / 导入 / 配置 / 统计 / 日志 / 删除 / 诊断 / 预置数据
export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;
  const headers = { 'Content-Type': 'application/json' };

  // 只处理 /api/admin/*，其余放行
  if (!path.startsWith('/api/admin/')) return next(request);
  try {
    if (path === '/api/admin/health')        return handleHealth(env, headers);
    if (path === '/api/admin/template')      return handleTemplate(env, request);
    if (path === '/api/admin/import_owners') return handleImport(request, env, headers);
    if (path === '/api/admin/config')        return handleConfig(request, env, headers);
    if (path === '/api/admin/save_poll')     return handleSavePoll(request, env, headers);
    if (path === '/api/admin/poll_result')   return handleResult(env, headers);
    if (path === '/api/admin/audit_logs')    return handleLogs(request, env, headers);
    if (path === '/api/admin/delete_user')   return handleDelete(request, env, headers);
    if (path === '/api/admin/diagnose')      return handleDiagnose(request, env, headers);
    if (path === '/api/admin/seed')          return handleSeed(request, env, headers);
    if (path === '/api/admin/registry')      return handleRegistry(env, headers);
    if (path === '/api/admin/export_csv')    return handleExportCSV(env, request);
    return new Response(JSON.stringify({ error: 'Not Found', path }), { status: 404, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server Error', detail: e.message }), { status: 500, headers });
  }
}

async function handleHealth(env, h) {
  let db = false, r2 = false;
  try { await env.DB.prepare('SELECT 1').first(); db = true; } catch (e) {}
  try { await env.ATTACH_BUCKET.list({ limit: 1 }); r2 = true; } catch (e) {}
  return json(h, { status: 'ok', env: env.ENV, db: db ? 'ok' : 'err', r2: r2 ? 'ok' : 'err' });
}

// CSV 模板（含 BOM，Excel 可直接开）
function handleTemplate(env, request) {
  const csv = '﻿手机号,身份证号,房号,专有部分面积\n13800138000,110101199001011234,1-101,89.56';
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="业主台账模板.csv"' }
  });
}

// 批量导入：前端发 raw 片段，后端加盐哈希，幂等写入
async function handleImport(req, env, headers) {
  const { rows, batchId, adminEmail } = await req.json();
  if (!Array.isArray(rows) || !rows.length) return json(headers, { error: '无数据' }, 400);
  let inserted = 0, skipped = 0, failed = [];
  for (let i = 0; i < rows.length; i++) {
    const { uuid, raw, area, room } = rows[i];
    try {
      const hash = await sha256(`${raw}${env.HASH_SALT || ''}`);
      const r = await env.DB.prepare('INSERT OR IGNORE INTO owner_identity (uuid, hash_digest, area_cents, room_no, import_batch) VALUES (?,?,?,?,?)')
        .bind(uuid, hash, Math.round((parseFloat(area) || 0) * 100), room || null, batchId || null).run();
      r.changes > 0 ? inserted++ : skipped++;
    } catch (e) { failed.push({ row: i, reason: e.message }); }
  }
  await log(env, null, 'import_owners', `${batchId}: ${inserted}/${rows.length}`, adminEmail);
  return json(headers, { total: rows.length, inserted, skipped, failed });
}

// 读写 system_config
async function handleConfig(req, env, headers) {
  if (req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT config_key, config_value FROM system_config').all();
    const cfg = {};
    (rows.results || []).forEach(r => cfg[r.config_key] = r.config_value);
    return json(headers, cfg);
  }
  const { key, value, adminEmail } = await req.json();
  await env.DB.prepare('INSERT INTO system_config (config_key, config_value) VALUES (?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value').bind(key, value).run();
  await log(env, null, 'update_config', `${key}=${value}`, adminEmail);
  return json(headers, { success: true });
}

// 保存投票事项（category 决定门槛）
async function handleSavePoll(req, env, headers) {
  const { title, category, description, adminEmail } = await req.json();
  await env.DB.prepare('UPDATE poll_config SET title=?, category=?, description=? WHERE poll_id=?')
    .bind(title, category, description, 'single_poll').run();
  await log(env, null, 'save_poll', `category=${category}`, adminEmail);
  return json(headers, { success: true });
}

// 统计（与前台算法一致）
async function handleResult(env, h) {
  const cfg = await env.DB.prepare('SELECT category FROM poll_config WHERE poll_id=?').bind('single_poll').first();
  const cat = cfg ? cfg.category : 1;
  const total = await env.DB.prepare('SELECT COUNT(*) c, COALESCE(SUM(area_cents),0) a FROM owner_identity').first();
  const voted = await env.DB.prepare('SELECT COUNT(*) c, COALESCE(SUM(o.area_cents),0) a FROM owner_identity o JOIN vote_records v ON o.uuid=v.uuid').first();
  const agree = await env.DB.prepare("SELECT COUNT(*) c, COALESCE(SUM(o.area_cents),0) a FROM owner_identity o JOIN vote_records v ON o.uuid=v.uuid WHERE v.vote_content='赞成'").first();
  const ph = total.c ? voted.c / total.c : 0, pa = total.a ? voted.a / total.a : 0;
  const vh = voted.c ? agree.c / voted.c : 0, va = total.a ? agree.a / total.a : 0;
  const partReq = 2 / 3;
  const agreeReq = (cat >= 6 && cat <= 8) ? 0.75 : 0.5;
  const agreeStrict = !(cat >= 6 && cat <= 8);
  const passed = (ph >= partReq && pa >= partReq) && (agreeStrict ? (vh > agreeReq && va > agreeReq) : (vh >= agreeReq && va >= agreeReq));
  return json(h, {
    total: { households: total.c, area_cents: total.a },
    voted: { households: voted.c, area_cents: voted.a },
    agree: { households: agree.c, area_cents: agree.a },
    rates: { participationHousehold: ph, participationArea: pa, agreeHousehold: vh, agreeArea: va },
    category: cat,
    thresholds: { participation: partReq, agree: agreeReq, agreeStrictGreater: agreeStrict },
    passed
  });
}

async function handleLogs(req, env, headers) {
  const rows = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
  return json(headers, rows.results || []);
}

// 按 UUID 删除全部数据（满足删除权）+ 级联删 R2
async function handleDelete(req, env, headers) {
  const { uuid, adminEmail } = await req.json();
  const keys = await env.DB.prepare('SELECT key FROM attachments WHERE uuid=?').bind(uuid).all();
  for (const r of (keys.results || [])) { try { await env.ATTACH_BUCKET.delete(r.key); } catch (e) {} }
  await env.DB.prepare('DELETE FROM attachments WHERE uuid=?').bind(uuid).run();
  await env.DB.prepare('DELETE FROM vote_records WHERE uuid=?').bind(uuid).run();
  await env.DB.prepare('DELETE FROM audit_logs WHERE uuid=?').bind(uuid).run();
  await env.DB.prepare('DELETE FROM owner_identity WHERE uuid=?').bind(uuid).run();
  await log(env, uuid, 'delete_user', `deleted ${uuid}`, adminEmail);
  return json(headers, { success: true });
}

async function handleDiagnose(req, env, headers) {
  if (!req.headers.get('cf-access-authenticated-user-email')) return json(headers, { error: 'Unauthorized' }, 403);
  const r = {};
  const o = await env.DB.prepare('SELECT COUNT(*) c FROM owner_identity').first(); r.owners = o.c;
  const v = await env.DB.prepare('SELECT COUNT(*) c FROM vote_records').first(); r.votes = v.c;
  return json(headers, { env: env.ENV, ...r });
}

// ====== 幂等预置 51 户测试数据（5645㎡），可重复调用，覆盖更新 ======
async function handleSeed(req, env, headers) {
  const SALT = env.HASH_SALT || '';
  const owners = [
    ['1-1-101',92],['1-1-102',99],['1-1-201',93],['1-1-202',112],['1-1-301',114],['1-1-302',94],
    ['1-2-101',92],['1-2-102',104],['1-2-201',127],['1-2-202',116],['1-2-301',108],['1-2-302',102],
    ['2-1-101',131],['2-1-102',110],['2-1-201',118],['2-1-202',108],['2-1-301',118],['2-1-302',101],
    ['2-2-101',93],['2-2-102',130],['2-2-201',125],['2-2-202',113],['2-2-301',130],['2-2-302',129],
    ['3-1-101',104],['3-1-102',132],['3-1-201',124],['3-1-202',115],['3-1-301',99],['3-1-302',110],
    ['3-2-101',101],['3-2-102',106],['3-2-201',119],['3-2-202',132],['3-2-301',98],['3-2-302',92],
    ['4-1-101',107],['4-1-102',94],['4-1-201',128],['4-1-202',121],['4-1-301',105],['4-1-302',115],
    ['4-2-101',101],['4-2-102',99],['4-2-201',99],['4-2-202',95],['4-2-301',120],['4-2-302',125],
    ['5-1-101',104],['5-1-102',129],['5-1-201',112]
  ];
  let inserted = 0, areaTotal = 0;
  for (const [room, area] of owners) {
    const hash = await sha256(`00000${''}${room}${SALT}`); // 与 verify 公式一致：phoneLast5 + idLast3(空) + room + SALT
    const r = await env.DB.prepare('INSERT OR REPLACE INTO owner_identity (uuid, hash_digest, area_cents, room_no, import_batch) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(), hash, area * 100, room, 'seed').run();
    inserted++; areaTotal += area;
  }
  return json(headers, { total: owners.length, inserted, areaTotal });
}

// 业主清册（供后台列表 / 投票校验）
async function handleRegistry(env, h) {
  const rows = await env.DB.prepare('SELECT uuid, room_no, area_cents, has_voted FROM owner_identity ORDER BY room_no').all();
  return json(h, rows.results || []);
}

// 导出 CSV 投票结果
async function handleExportCSV(env, request) {
  const rows = await env.DB.prepare('SELECT o.room_no, o.area_cents, v.vote_content, v.created_at FROM owner_identity o LEFT JOIN vote_records v ON o.uuid=v.uuid ORDER BY o.room_no').all();
  const lines = ['房号,面积(㎡),投票选项,投票时间'];
  for (const r of (rows.results || [])) {
    lines.push(`${r.room_no},${(r.area_cents / 100).toFixed(2)},${r.vote_content || '未投票'},${r.created_at || ''}`);
  }
  return new Response('﻿' + lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="投票结果.csv"' }
  });
}

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function json(h, body, status) { return new Response(JSON.stringify(body), { headers: h, status: status || 200 }); }
async function log(env, uuid, action, detail, admin) {
  await env.DB.prepare('INSERT INTO audit_logs (uuid, admin_user, action, detail) VALUES (?,?,?,?)').bind(uuid, admin || 'unknown', action, detail).run();
}
