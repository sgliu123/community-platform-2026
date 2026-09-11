let uuid = null;
let keys = [];

async function verify() {
  const p5 = document.getElementById('phoneLast5').value.trim();
  const i3 = document.getElementById('idLast3').value.trim();
  const room = document.getElementById('room').value.trim();
  const msg = document.getElementById('msg');
  if (!p5 || !i3 || !room) { msg.className = 'msg error'; msg.textContent = '请完整填写三项'; return; }
  const res = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneLast5: p5, idLast3: i3, room }) });
  const d = await res.json();
  if (d.success) { uuid = d.uuid; msg.className = 'msg success'; msg.textContent = '核验通过'; document.getElementById('step1').style.display = 'none'; document.getElementById('step2').style.display = 'block'; }
  else { msg.className = 'msg error'; msg.textContent = d.error; }
}

async function submitVote() {
  const opt = document.querySelector('input[name=opt]:checked');
  const msg = document.getElementById('msg2');
  if (!opt) { msg.className = 'msg error'; msg.textContent = '请选择选项'; return; }
  const res = await fetch('/api/submit_vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid, voteContent: opt.value, attachmentKeys: keys }) });
  const d = await res.json();
  if (d.success) { document.getElementById('step2').style.display = 'none'; document.getElementById('step3').style.display = 'block'; }
  else { msg.className = 'msg error'; msg.textContent = d.error; }
}

document.getElementById('fileInput').addEventListener('change', async function (e) {
  const files = e.target.files;
  for (const f of files) {
    const r = await fetch('/api/upload_url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid, fileName: f.name, contentType: f.type }) });
    const { uploadUrl, key } = await r.json();
    await fetch(uploadUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type } });
    keys.push(key);
  }
});
