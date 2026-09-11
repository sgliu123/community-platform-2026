// 全局变量
let currentRoom = '';
let currentPollId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const savedUuid = localStorage.getItem('vote_uuid');
  if (savedUuid) {
    currentRoom = localStorage.getItem('vote_room') || '';
    showPolls();
  } else {
    document.getElementById('verify-section').style.display = 'block';
    document.getElementById('loading').style.display = 'none';
  }

  document.getElementById('verify-btn').addEventListener('click', verifyIdentity);
});

async function verifyIdentity() {
  const room = document.getElementById('room-input').value.trim();
  if (!room) {
    document.getElementById('verify-error').textContent = '请输入房号';
    return;
  }

  try {
    const res = await fetch('/api/vote/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('vote_uuid', data.uuid);
      localStorage.setItem('vote_room', room);
      currentRoom = room;
      document.getElementById('verify-section').style.display = 'none';
      showPolls();
    } else {
      document.getElementById('verify-error').textContent = data.message || '核验失败';
    }
  } catch (e) {
    document.getElementById('verify-error').textContent = '网络错误，请稍后重试';
  }
}

async function showPolls() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('polls-section').style.display = 'block';
  try {
    const res = await fetch('/api/vote/polls');
    const polls = await res.json();
    const listDiv = document.getElementById('polls-list');
    listDiv.innerHTML = polls.map(p => `
      <div class="poll-item" onclick="showPollDetail(${p.id})">
        <h3>${p.title}</h3>
        <p>${p.description || ''}</p>
        <small>${p.start_time} ~ ${p.end_time}</small>
        <span style="float:right;color:${p.status==='active'?'green':'gray'}">${p.status==='active'?'进行中':'已结束'}</span>
      </div>
    `).join('');
  } catch(e) {
    alert('获取投票列表失败');
  }
}

async function showPollDetail(pollId) {
  currentPollId = pollId;
  document.getElementById('polls-section').style.display = 'none';
  document.getElementById('poll-detail').style.display = 'block';

  try {
    const res = await fetch(`/api/vote/poll/${pollId}`);
    const poll = await res.json();
    document.getElementById('poll-title').textContent = poll.title;
    document.getElementById('poll-desc').textContent = poll.description;
    const optionsDiv = document.getElementById('poll-options');
    const opts = JSON.parse(poll.options);
    optionsDiv.innerHTML = opts.map((opt, i) => `
      <label class="option-item" data-index="${i}">
        <input type="radio" name="choice" value="${i}"> ${opt}
      </label>
    `).join('');
    document.getElementById('submit-vote-btn').onclick = submitVote;
  } catch(e) {
    alert('获取投票详情失败');
  }
}

async function submitVote() {
  const selected = document.querySelector('input[name="choice"]:checked');
  if (!selected) { alert('请选择一个选项'); return; }
  const choice = parseInt(selected.value);
  const uuid = localStorage.getItem('vote_uuid');
  try {
    const res = await fetch('/api/vote/submit_vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, poll_id: currentPollId, choice })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('vote-result').textContent = '投票成功！';
      setTimeout(() => { window.location.reload(); }, 1500);
    } else {
      document.getElementById('vote-result').textContent = data.message || '投票失败';
    }
  } catch(e) {
    document.getElementById('vote-result').textContent = '网络错误';
  }
}
