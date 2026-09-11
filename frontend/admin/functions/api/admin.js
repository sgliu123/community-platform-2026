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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 健康检查
    if (path === '/api/admin/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', db: !!db, r2: !!r2 }), { status: 200, headers: corsHeaders });
    }

    // 统计
    if (path === '/api/admin/stats' && request.method === 'GET') {
      const ownerStats = await db.prepare('SELECT COUNT(*) as totalOwners, COALESCE(SUM(area),0) as totalArea FROM owners').first();
      return new Response(JSON.stringify(ownerStats), { status: 200, headers: corsHeaders });
    }

    // 获取业主清册
    if (path === '/api/admin/owners' && request.method === 'GET') {
      const owners = await db.prepare('SELECT id, room_no, name, area, hash FROM owners ORDER BY room_no').all();
      return new Response(JSON.stringify(owners.results), { status: 200, headers: corsHeaders });
    }

    // 添加业主
    if (path === '/api/admin/owners' && request.method === 'POST') {
      const { room_no, name, area } = await request.json();
      if (!room_no || !name || !area) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: corsHeaders });
      }
      const salt = 'community-salt-2026';
      const hash = await sha256(room_no + salt);
      await db.prepare('INSERT OR REPLACE INTO owners (room_no, name, area, hash) VALUES (?, ?, ?, ?)')
        .bind(room_no, name, area, hash).run();
      return new Response(JSON.stringify({ success: true }), { status: 201, headers: corsHeaders });
    }

    // 导入业主清册（CSV）
    if (path === '/api/admin/import_owners' && request.method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return new Response(JSON.stringify({ error: '请上传CSV文件' }), { status: 400, headers: corsHeaders });
      }
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      let imported = 0;
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 3) continue;
        const room_no = parts[0].trim();
        const name = parts[1].trim();
        const areaStr = parts[2].trim();
        const area = Math.round(parseFloat(areaStr) * 100);
        if (isNaN(area)) continue;
        const salt = 'community-salt-2026';
        const hash = await sha256(room_no + salt);
        await db.prepare('INSERT OR REPLACE INTO owners (room_no, name, area, hash) VALUES (?, ?, ?, ?)')
          .bind(room_no, name, area, hash).run();
        imported++;
      }
      return new Response(JSON.stringify({ success: true, imported }), { status: 200, headers: corsHeaders });
    }

    // 获取投票列表
    if (path === '/api/admin/polls' && request.method === 'GET') {
      const polls = await db.prepare('SELECT * FROM polls ORDER BY start_time DESC').all();
      return new Response(JSON.stringify(polls.results), { status: 200, headers: corsHeaders });
    }

    // 创建投票
    if (path === '/api/admin/polls' && request.method === 'POST') {
      const { title, description, poll_category, start_time, end_time, options } = await request.json();
      if (!title || !start_time || !end_time || !options) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: corsHeaders });
      }
      await db.prepare(
        'INSERT INTO polls (title, description, poll_category, start_time, end_time, options, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(title, description || '', parseInt(poll_category) || 1, start_time, end_time, options, 'pending').run();
      return new Response(JSON.stringify({ success: true }), { status: 201, headers: corsHeaders });
    }

    // 计票结果
    if (path === '/api/admin/results' && request.method === 'GET') {
      const polls = await db.prepare('SELECT * FROM polls ORDER BY start_time DESC').all();
      const results = [];
      for (const poll of polls.results) {
        const stats = await computeResult(db, poll);
        results.push(stats);
      }
      return new Response(JSON.stringify(results), { status: 200, headers: corsHeaders });
    }

    // 审计日志
    if (path === '/api/admin/logs' && request.method === 'GET') {
      const logs = await db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
      return new Response(JSON.stringify(logs.results), { status: 200, headers: corsHeaders });
    }

    // 种子数据（预置51户/5645㎡）
    if (path === '/api/admin/seed' && request.method === 'POST') {
      const owners = [
        ['1-1-101','张三',14000],['1-1-102','李四',12000],['1-1-201','王五',13000],
        ['1-1-202','赵六',11000],['1-1-301','孙七',12500],['1-1-302','周八',13500],
        ['1-2-101','吴九',14500],['1-2-102','郑十',11500],['1-2-201','冯一',12800],
        ['1-2-202','陈二',13200],['1-2-301','褚三',13800],['1-2-302','卫四',14200],
        ['2-1-101','蒋五',15000],['2-1-102','沈六',11800],['2-1-201','韩七',12200],
        ['2-1-202','杨八',13600],['2-1-301','朱九',14400],['2-1-302','秦十',14800],
        ['2-2-101','尤一',15200],['2-2-102','许二',10800],['2-2-201','何三',12600],
        ['2-2-202','吕四',13400],['2-2-301','施五',14000],['2-2-302','张六',14600],
        ['3-1-101','孔七',15500],['3-1-102','曹八',11200],['3-1-201','严九',12400],
        ['3-1-202','华十',13800],['3-1-301','金一',14200],['3-1-302','魏二',15000],
        ['3-2-101','陶三',16000],['3-2-102','姜四',10500],['3-2-201','戚五',12800],
        ['3-2-202','谢六',13600],['3-2-301','邹七',14400],['3-2-302','喻八',15200],
        ['4-1-101','柏九',15800],['4-1-102','水十',11000],['4-1-201','窦一',12200],
        ['4-1-202','章二',13400],['4-1-301','云三',14000],['4-1-302','苏四',14800],
        ['4-2-101','潘五',15600],['4-2-102','葛六',11400],['4-2-201','范七',12600],
        ['4-2-202','彭八',13800],['4-2-301','鲁九',14600],['4-2-302','马十',15400],
        ['5-1-101','方一',16200],['5-1-102','任二',10800],['5-1-201','姚三',12400],
        ['5-1-202','卢四',13600],['5-1-301','汪五',14400]
      ];
      const salt = 'community-salt-2026';
      let inserted = 0;
      for (const [room_no, name, area] of owners) {
        const hash = await sha256(room_no + salt);
        await db.prepare('INSERT OR REPLACE INTO owners (room_no, name, area, hash) VALUES (?, ?, ?, ?)')
          .bind(room_no, name, area, hash).run();
        inserted++;
      }
      const totalArea = owners.reduce((sum, o) => sum + o[2], 0);
      return new Response(JSON.stringify({ total: inserted, inserted, areaTotal: totalArea }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

// 计票辅助函数
async function computeResult(db, poll) {
  const totalOwners = (await db.prepare('SELECT COUNT(*) as c FROM owners').first()).c;
  const totalArea = (await db.prepare('SELECT COALESCE(SUM(area),0) as s FROM owners').first()).s;
  const participants = (await db.prepare('SELECT COUNT(DISTINCT owner_id) as c FROM votes WHERE poll_id = ?').bind(poll.id).first()).c;
  const areaParticipated = (await db.prepare('SELECT COALESCE(SUM(weight),0) as s FROM votes WHERE poll_id = ?').bind(poll.id).first()).s;
  const approvalVotes = (await db.prepare('SELECT COUNT(*) as c FROM votes WHERE poll_id = ? AND choice = 0').bind(poll.id).first()).c;
  const approvalArea = (await db.prepare('SELECT COALESCE(SUM(weight),0) as s FROM votes WHERE poll_id = ? AND choice = 0').bind(poll.id).first()).s;
  const participationRate = totalOwners > 0 ? participants / totalOwners : 0;
  const areaRate = totalArea > 0 ? areaParticipated / totalArea : 0;
  const approvalRate = participants > 0 ? approvalVotes / participants : 0;
  let conclusion = '未满足条件';
  if (poll.poll_category <= 5) {
    if (participationRate >= 2/3 && areaRate >= 2/3) {
      if (approvalRate > 0.5 && approvalArea / areaParticipated > 0.5) {
        conclusion = '通过（一般事项双过半）';
      } else {
        conclusion = '未通过（同意率不足50%）';
      }
    } else {
      conclusion = '未达到双2/3参与门槛';
    }
  } else {
    if (participationRate >= 2/3 && areaRate >= 2/3) {
      if (approvalRate >= 0.75 && approvalArea / areaParticipated >= 0.75) {
        conclusion = '通过（重大事项双3/4）';
      } else {
        conclusion = '未通过（同意率不足75%）';
      }
    } else {
      conclusion = '未达到双2/3参与门槛';
    }
  }
  return {
    title: poll.title,
    totalOwners,
    totalArea,
    participants,
    areaParticipated,
    participationRate,
    areaRate,
    approvalRate,
    conclusion
  };
}

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
