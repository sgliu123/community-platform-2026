export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith('/api/')) {
    return env.ASSETS.fetch(request);
  }

  const db = env.DB;
  const r2 = env.R2;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 核验身份（房号）
    if (path === '/api/vote/verify' && request.method === 'POST') {
      const { room } = await request.json();
      if (!room) {
        return new Response(JSON.stringify({ success: false, message: '房号不能为空' }), { status: 400, headers: corsHeaders });
      }
      const owner = await db.prepare('SELECT id, room_no, hash FROM owners WHERE room_no = ?').bind(room).first();
      if (!owner) {
        return new Response(JSON.stringify({ success: false, message: '房号不存在' }), { status: 200, headers: corsHeaders });
      }
      const uuid = owner.hash.substring(0, 32);
      return new Response(JSON.stringify({ success: true, uuid, room: owner.room_no }), { status: 200, headers: corsHeaders });
    }

    // 获取投票列表
    if (path === '/api/vote/polls' && request.method === 'GET') {
      const polls = await db.prepare('SELECT id, title, description, start_time, end_time, status FROM polls ORDER BY start_time DESC').all();
      return new Response(JSON.stringify(polls.results), { status: 200, headers: corsHeaders });
    }

    // 获取单个投票详情
    if (path.match(/^\/api\/vote\/poll\/(\d+)$/) && request.method === 'GET') {
      const pollId = parseInt(path.split('/')[4]);
      const poll = await db.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first();
      if (!poll) {
        return new Response(JSON.stringify({ error: '投票不存在' }), { status: 404, headers: corsHeaders });
      }
      return new Response(JSON.stringify(poll), { status: 200, headers: corsHeaders });
    }

    // 提交投票
    if (path === '/api/vote/submit_vote' && request.method === 'POST') {
      const { uuid, poll_id, choice } = await request.json();
      if (!uuid || !poll_id || choice === undefined) {
        return new Response(JSON.stringify({ success: false, message: '参数不完整' }), { status: 400, headers: corsHeaders });
      }
      const existing = await db.prepare('SELECT id FROM votes WHERE uuid = ? AND poll_id = ?').bind(uuid, poll_id).first();
      if (existing) {
        return new Response(JSON.stringify({ success: false, message: '您已投过票' }), { status: 409, headers: corsHeaders });
      }
      const owner = await db.prepare('SELECT id, area FROM owners WHERE hash LIKE ?').bind(uuid + '%').first();
      if (!owner) {
        return new Response(JSON.stringify({ success: false, message: '身份无效' }), { status: 403, headers: corsHeaders });
      }
      const weight = owner.area;
      await db.prepare('INSERT INTO votes (uuid, poll_id, owner_id, choice, weight) VALUES (?, ?, ?, ?, ?)')
        .bind(uuid, poll_id, owner.id, choice, weight).run();
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    // 附件预览（返回R2签名URL）
    if (path === '/api/vote/attachment' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response(JSON.stringify({ error: '缺少key参数' }), { status: 400, headers: corsHeaders });
      }
      const object = await r2.get(key);
      if (!object) {
        return new Response(JSON.stringify({ error: '附件不存在' }), { status: 404, headers: corsHeaders });
      }
      const signedUrl = await r2.createSignedUrl(key, { expiry: 3600 });
      return new Response(JSON.stringify({ url: signedUrl }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
