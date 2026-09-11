const ADMIN = prompt('管理员邮箱（用于审计）') || 'admin@example.com';
const BATCH = 50;

function tab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
}

// CSV 解析（支持简易逗号分隔）
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const header = lines.shift().split(',').map(s => s.trim());
  return lines.map(line => {
    const cols = line.split(',').map(s => s.trim());
    return { phone: cols[0], idCard: cols[1], room: cols[2], area: cols[3] };
  });
}

async function downloadTemplate() {
  const r = await fetch('/api/template');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = '业主台账模板.csv'; a.click();
}

async function importOwners() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return alert('请选择文件');
  const text = await file.text();
  const rows = parseCSV(text);
  const batchId = 'batch_' + Date.now();
  let inserted = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(r => ({
      uuid: crypto.randomUUID(),
      raw: (r.phone || '').slice(-5) + (r.idCard || '').slice(-3) + (r.room || ''),
      area: parseFloat(r.area) || 0,
      room: r.room
    }));
    const res = await fetch('/api/import_owners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: chunk, batchId, adminEmail: ADMIN }) });
    const d = await res.json();
    inserted += d.inserted || 0; skipped += d.skipped || 0;
  }
  document.getElementById('importResult').textContent = `完成：成功 ${inserted}，跳过 ${skipped}（已存在）`;
}

async function savePoll() {
  const title = document.getElementById('pollTitle').value;
  const category = parseInt(document.getElementById('pollCategory').value);
  await fetch('/api/save_poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, adminEmail: ADMIN }) });
  document.getElementById('pollMsg').textContent = '已保存';
}

async function loadResult() {
  const d = await (await fetch('/api/poll_result')).json();
  const box = document.getElementById('resultBox');
  const pct = v => (v * 100).toFixed(1) + '%';
  const req = d.thresholds;
  const partOk = d.rates.participationHousehold >= req.participation && d.rates.participationArea >= req.participation;
  const agreeOk = req.agreeStrictGreater
    ? (d.rates.agreeHousehold > req.agree && d.rates.agreeArea > req.agree)
    : (d.rates.agreeHousehold >= req.agree && d.rates.agreeArea >= req.agree);
  box.innerHTML = `
    <p>总户数：${d.total.households}　总面积：${(d.total.area_cents / 100).toFixed(2)} ㎡</p>
    <p>已投票：${d.voted.households}　${(d.voted.area_cents / 100).toFixed(2)} ㎡</p>
    <p>赞成：${d.agree.households}　${(d.agree.area_cents / 100).toFixed(2)} ㎡</p>
    <p>参与率（户/面积）：${pct(d.rates.participationHousehold)} / ${pct(d.rates.participationArea)}（门槛 ≥${pct(req.participation)}）</p>
    <p>同意率（户/面积）：${pct(d.rates.agreeHousehold)} / ${pct(d.rates.agreeArea)}（门槛 ${req.agreeStrictGreater ? '>' : '≥'}${pct(req.agree)}）</p>
    <p style="font-weight:bold;color:${d.passed ? 'green' : 'red'}">判定：${d.passed ? '✅ 通过' : '❌ 未通过'}</p>
    <p>参与门槛：${partOk ? '✅ 达标' : '❌ 未达标'}　同意门槛：${agreeOk ? '✅ 达标' : '❌ 未达标'}</p>`;
}

async function loadLogs() {
  const rows = await (await fetch('/api/audit_logs')).json();
  document.getElementById('logBody').innerHTML = rows.map(l => `<tr><td>${new Date(l.created_at).toLocaleString()}</td><td>${l.action}</td><td>${l.detail || ''}</td></tr>`).join('');
}

async function deleteUser() {
  const uuid = document.getElementById('delUuid').value.trim();
  if (!uuid) return;
  if (!confirm('确定删除该用户全部数据？不可撤销')) return;
  await fetch('/api/delete_user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid, adminEmail: ADMIN }) });
  document.getElementById('delMsg').textContent = '已删除';
}

async function diagnose() {
  const d = await (await fetch('/api/diagnose')).json();
  document.getElementById('diagResult').textContent = JSON.stringify(d, null, 2);
}

window.onload = () => { loadResult(); loadLogs(); };
