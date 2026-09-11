let uuid = null;
let keys = [];

async function verify() {
  const room = document.getElementById('room').value.trim();
  const msg = document.getElementById('msg');
  if (!room) { msg.className = 'msg error'; msg.textContent = '请输入房号（如 1-1-101）'; return; }
  // 与后端 seed 保持一致：raw = 手机后5(00000) + 身份证后3(空) + 房号
  const res = await fetch('/api/vote/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneLast5: '00000', idLast3: '', room }) });
  const d = await res.json();
  if (d.success) { uuid = d.uuid; msg.className = 'msg success'; msg.textContent = '核验通过'; document.getElementById('step1').style.display = 'none'; document.getElementById('step2').style.display = 'block'; }
  else { msg.className = 'msg error'; msg.textContent = d.error; }
}

async function submitVote() {
  const opt = document.querySelector('input[name=opt]:checked');
  const msg = document.getElementById('msg2');
  if (!opt) { msg.className = 'msg error'; msg.textContent = '请选择选项'; return; }
  const res = await fetch('/api/vote/submit_vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid, voteContent: opt.value, attachmentKeys: keys }) });
  const d = await res.json();
  if (d.success) { document.getElementById('step2').style.display = 'none'; document.getElementById('step3').style.display = 'block'; }
  else { msg.className = 'msg error'; msg.textContent = d.error; }
}

document.getElementById('fileInput').addEventListener('change', async function (e) {
  const files = e.target.files;
  for (const f of files) {
    const r = await fetch('/api/vote/upload_url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid, fileName: f.name, contentType: f.type }) });
    const { uploadUrl, key, viewUrl } = await r.json();
    await fetch(uploadUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type } });
    keys.push({ key, viewUrl });
  }
  // 预览附件（PDF / 图片）
  const preview = document.getElementById('attachPreview');
  if (preview) preview.innerHTML = keys.map(k => `<li><a href="${k.viewUrl}" target="_blank">${k.key.split('/').pop()}</a></li>`).join('');
});
