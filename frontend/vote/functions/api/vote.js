// 前台 API：健康 / 核验 / 投票 / 附件 / 统计 / 诊断
export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;
  const headers = { 'Content-Type': 'application/json' };

  // 只处理 /api/vote/*，其余交给静态资源/next
  if (!path.startsWith('/api/vote/')) return next(request);
  try {
    if (path === '/api/vote/health')       return handleHealth(env, headers);
    if (path === '/api/vote/verify')       return handleVerify(request, env, headers);
    if (path === '/api/vote/submit_vote')  return handleSubmit(request, env, headers);
    if (path === '/api/vote/upload_url')   return handleUploadUrl(request, env, headers);
    if (path === '/api/vote/attachment')   return handleAttachment(request, env, headers);
    if (path === '/api/vote/poll_result')  return handleResult(env, headers);
    if (path === '/api/vote/diagnose')     return handleDiagnose(request, env, headers);
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

// 身份核验：SHA256(手机号后5 + 身份证后3 + 房号 + 盐)
async function handleVerify(req, env, h) {
  const { phoneLast5, idLast3 = '', room } = await req.json();
  if (!phoneLast5 || !room) return json(h, { error: '请填写核验信息' }, 400);
  const hash = await sha256(`${phoneLast5}${idLast3}${room}${env.HASH_SALT || ''}`);
  // 兼容新旧表名：优先 owner_identity，回落 owners
  let row = await env.DB.prepare('SELECT uuid, has_voted FROM owner_identity WHERE hash_digest = ?').bind(hash).first();
  if (!row) row = await env.DB.prepare('SELECT uuid, has_voted FROM owners WHERE hash = ?').bind(hash).first();
  if (!row) { await log(env, null, 'verify_fail', ''); return json(h, { error: '身份信息不匹配' }, 401); }
  if (row.has_voted) return json(h, { error: '您已投过票，不能重复投票' }, 409);
  await log(env, row.uuid, 'verify_success', '');
  return json(h, { success: true, uuid: row.uuid });
}

// 提交投票：原子事务，UNIQUE 兜底
async function handleSubmit(req, env, h) {
  const { uuid, voteContent, attachmentKeys } = await req.json();
  if (!uuid || !voteContent) return json(h, { error: '缺少字段' }, 400);
  const updated = await env.DB.prepare('UPDATE owner_identity SET has_voted=1 WHERE uuid=? AND has_voted=0').bind(uuid).run();
  if (updated.changes === 0) return json(h, { error: '已投票或身份无效' }, 409);
  try {
    await env.DB.prepare('INSERT INTO vote_records (uuid, vote_content) VALUES (?,?)').bind(uuid, voteContent).run();
    if (Array.isArray(attachmentKeys)) {
      for (const key of attachmentKeys) {
        await env.DB.prepare('INSERT OR IGNORE INTO attachments (key, uuid) VALUES (?,?)').bind(key, uuid).run();
      }
    }
    await log(env, uuid, 'submit_vote', voteContent);
    return json(h, { success: true });
  } catch (e) {
    await env.DB.prepare('UPDATE owner_identity SET has_voted=0 WHERE uuid=?').bind(uuid).run();
    return json(h, { error: '写入失败' }, 500);
  }
}

// 预签名上传 URL（有效期 300s）
async function handleUploadUrl(req, env, h) {
  const { uuid, fileName, contentType } = await req.json();
  const key = `single_poll/${uuid}/${Date.now()}_${fileName}`;
  const upUrl = await env.ATTACH_BUCKET.createPresignedUrl({ key, expiresIn: 300, method: 'PUT', contentType });
  // 读签名 URL（默认有效期 1 小时，供前端预览）
  const viewUrl = await env.ATTACH_BUCKET.createPresignedUrl({ key, expiresIn: 3600, method: 'GET' });
  return json(h, { uploadUrl: upUrl, viewUrl, key });
}

// 附件预览：返回 R2 签名 URL（PDF / 图片均可直接 <img> / <iframe> 打开）
async function handleAttachment(req, env, h) {
  const key = new URL(req.url).searchParams.get('key');
  if (!key) return json(h, { error: '缺少 key' }, 400);
  const viewUrl = await env.ATTACH_BUCKET.createPresignedUrl({ key, expiresIn: 3600, method: 'GET' });
  return json(h, { viewUrl });
}

// 表决结果统计（民法典第278条）
async function handleResult(env, h) {
  const cfg = await env.DB.prepare('SELECT category FROM poll_config WHERE poll_id=?').bind('single_poll').first();
  const cat = cfg ? cfg.category : 1;
  const total = await env.DB.prepare('SELECT COUNT(*) c, COALESCE(SUM(area_cents),0) a FROM owner_identity').first();
  const voted = await env.DB.prepare('SELECT COUNT(*) c, COALESCE(SUM(o.area_cents),0) a FROM owner_identity o JOIN vote_records v ON o.uuid=v.uuid').first();
  const agree = await env.DB.prepare("SELECT COUNT(*) c, COALESCE(SUM(o.area_cents),0) a FROM owner_identity o JOIN vote_records v ON o.uuid=v.uuid WHERE v.vote_content='赞成'").first();

  const ph = total.c ? voted.c / total.c : 0;
  const pa = total.a ? voted.a / total.a : 0;
  const vh = voted.c ? agree.c / voted.c : 0;
  const va = voted.a ? agree.a / voted.a : 0;

  const partReq = 2 / 3;
  const agreeReq = (cat >= 6 && cat <= 8) ? 0.75 : 0.5;
  const agreeStrict = !(cat >= 6 && cat <= 8);

  const passPart = ph >= partReq && pa >= partReq;
  const passAgree = agreeStrict ? (vh > agreeReq && va > agreeReq) : (vh >= agreeReq && va >= agreeReq);
  const passed = passPart && passAgree;

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

async function handleDiagnose(req, env, h) {
  if (!req.headers.get('cf-access-authenticated-user-email')) return json(h, { error: 'Unauthorized' }, 403);
  const r = {};
  const o = await env.DB.prepare('SELECT COUNT(*) c FROM owner_identity').first(); r.owners = o.c;
  const v = await env.DB.prepare('SELECT COUNT(*) c FROM vote_records').first(); r.votes = v.c;
  return json(h, { env: env.ENV, ...r });
}

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function json(h, body, status) { return new Response(JSON.stringify(body), { headers: h, status: status || 200 }); }
async function log(env, uuid, action, detail) {
  await env.DB.prepare('INSERT INTO audit_logs (uuid, action, detail) VALUES (?,?,?)').bind(uuid, action, detail).run();
}
