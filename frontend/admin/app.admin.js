let currentTab = 'dashboard';
let ownersData = [];
let pollsData = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadDashboard();
  document.getElementById('loading').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      switch (currentTab) {
        case 'dashboard': await loadDashboard(); break;
        case 'polls': await loadPolls(); break;
        case 'owners': await loadOwners(); break;
        case 'results': await loadResults(); break;
        case 'logs': await loadLogs(); break;
      }
    });
  });
});

async function loadDashboard() {
  const area = document.getElementById('content-area');
  try {
    const stats = await fetch('/api/admin/stats').then(r => r.json());
    area.innerHTML = `
      <div class="card">
        <h3>概览</h3>
        <p>业主总数：${stats.totalOwners || 0}</p>
        <p>总产权面积：${((stats.totalArea || 0)/100).toFixed(2)} ㎡</p>
      </div>
      <div class="card">
        <h3>快速操作</h3>
        <button class="btn btn-primary" onclick="switchTab('polls')">管理投票</button>
        <button class="btn btn-primary" onclick="switchTab('owners')">管理业主</button>
        <button class="btn btn-success" onclick="seedData()">预置测试数据（51户）</button>
      </div>
    `;
  } catch(e) {
    area.innerHTML = '<div class="card">加载失败</div>';
  }
}

function switchTab(tabName) {
  document.querySelector(`.tab[data-tab="${tabName}"]`).click();
}

async function seedData() {
  if (!confirm('将重置业主数据为51户/5645㎡，确定？')) return;
  try {
    const res = await fetch('/api/admin/seed', { method: 'POST' });
    const data = await res.json();
    alert(`预置完成：${data.inserted}户，总面积${(data.areaTotal/100).toFixed(2)}㎡`);
    loadDashboard();
  } catch(e) {
    alert('预置失败');
  }
}

async function loadPolls() {
  const area = document.getElementById('content-area');
  try {
    const res = await fetch('/api/admin/polls');
    pollsData = await res.json();
    area.innerHTML = `
      <div class="card">
        <button class="btn btn-primary" onclick="showCreatePollForm()">新建投票</button>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>标题</th><th>类别</th><th>状态</th><th>起止时间</th><th>操作</th></tr></thead>
          <tbody>
            ${pollsData.map(p => `
              <tr>
                <td>${p.title}</td>
                <td>${p.poll_category <=5 ? '一般' : '重大'}</td>
                <td>${p.status}</td>
                <td>${p.start_time} ~ ${p.end_time}</td>
                <td>
                  <button class="btn btn-primary btn-sm" onclick="editPoll(${p.id})">编辑</button>
                  <button class="btn btn-danger btn-sm" onclick="deletePoll(${p.id})">删除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) {
    area.innerHTML = '<div class="card">加载失败</div>';
  }
}

async function loadOwners() {
  const area = document.getElementById('content-area');
  try {
    const res = await fetch('/api/admin/owners');
    ownersData = await res.json();
    area.innerHTML = `
      <div class="card">
        <button class="btn btn-primary" onclick="showImportModal()">导入业主清册（CSV）</button>
        <button class="btn btn-primary" onclick="showAddOwnerModal()">添加业主</button>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>房号</th><th>姓名</th><th>面积(㎡)</th><th>操作</th></tr></thead>
          <tbody>
            ${ownersData.map(o => `
              <tr>
                <td>${o.room_no}</td>
                <td>${o.name}</td>
                <td>${(o.area/100).toFixed(2)}</td>
                <td>
                  <button class="btn btn-danger btn-sm" onclick="deleteOwner(${o.id})">删除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) {
    area.innerHTML = '<div class="card">加载失败</div>';
  }
}

async function loadResults() {
  const area = document.getElementById('content-area');
  try {
    const res = await fetch('/api/admin/results');
    const data = await res.json();
    area.innerHTML = `
      <div class="card">
        <h3>计票结果</h3>
        ${data.map(p => `
          <div style="margin-bottom:20px;">
            <h4>${p.title}</h4>
            <p>参与人数：${p.participants} / ${p.totalOwners}（${(p.participationRate*100).toFixed(2)}%）</p>
            <p>参与面积：${(p.areaParticipated/100).toFixed(2)} / ${(p.totalArea/100).toFixed(2)}（${(p.areaRate*100).toFixed(2)}%）</p>
            <p>同意率：${(p.approvalRate*100).toFixed(2)}%</p>
            <p>结论：${p.conclusion}</p>
          </div>
        `).join('')}
      </div>
    `;
  } catch(e) {
    area.innerHTML = '<div class="card">加载失败</div>';
  }
}

async function loadLogs() {
  const area = document.getElementById('content-area');
  try {
    const res = await fetch('/api/admin/logs');
    const logs = await res.json();
    area.innerHTML = `
      <div class="card">
        <table>
          <thead><tr><th>时间</th><th>操作</th><th>详情</th><th>操作者</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${l.created_at}</td>
                <td>${l.action}</td>
                <td>${l.detail}</td>
                <td>${l.operator}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(e) {
    area.innerHTML = '<div class="card">加载失败</div>';
  }
}

// 模态框辅助函数
function showModal(html) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="modal-content">${html}</div>`;
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  return modal;
}

function showCreatePollForm() {
  showModal(`
    <h3>新建投票</h3>
    <form id="poll-form">
      <label>标题：<input type="text" name="title" required></label><br>
      <label>描述：<textarea name="description"></textarea></label><br>
      <label>类别：
        <select name="poll_category">
          <option value="1">一般事项（双过半）</option>
          <option value="6">重大事项（双3/4）</option>
        </select>
      </label><br>
      <label>开始时间：<input type="datetime-local" name="start_time" required></label><br>
      <label>结束时间：<input type="datetime-local" name="end_time" required></label><br>
      <label>选项（逗号分隔）：<input type="text" name="options" value="赞成,反对,弃权" required></label><br>
      <button type="submit" class="btn btn-primary">创建</button>
      <button type="button" class="btn" onclick="this.closest('.modal').remove()">取消</button>
    </form>
  `);
  document.getElementById('poll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    data.options = JSON.stringify(data.options.split(','));
    const res = await fetch('/api/admin/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if(res.ok) {
      alert('创建成功');
      e.target.closest('.modal').remove();
      loadPolls();
    } else {
      alert('创建失败');
    }
  });
}

function showImportModal() {
  showModal(`
    <h3>导入业主清册（CSV）</h3>
    <form id="import-form">
      <input type="file" accept=".csv" required>
      <button type="submit" class="btn btn-primary">导入</button>
      <button type="button" class="btn" onclick="this.closest('.modal').remove()">取消</button>
    </form>
  `);
  document.getElementById('import-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = e.target.querySelector('input[type="file"]');
    const file = fileInput.files[0];
    if(!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/admin/import_owners', { method: 'POST', body: formData });
    const result = await res.json();
    alert(result.message || '导入完成');
    e.target.closest('.modal').remove();
    loadOwners();
  });
}

function showAddOwnerModal() {
  showModal(`
    <h3>添加业主</h3>
    <form id="add-owner-form">
      <label>房号：<input type="text" name="room_no" required></label><br>
      <label>姓名：<input type="text" name="name" required></label><br>
      <label>面积（㎡）：<input type="number" step="0.01" name="area" required></label><br>
      <button type="submit" class="btn btn-primary">添加</button>
      <button type="button" class="btn" onclick="this.closest('.modal').remove()">取消</button>
    </form>
  `);
  document.getElementById('add-owner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    data.area = Math.round(parseFloat(data.area) * 100);
    const res = await fetch('/api/admin/owners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if(res.ok) {
      alert('添加成功');
      e.target.closest('.modal').remove();
      loadOwners();
    } else {
      alert('添加失败');
    }
  });
}
