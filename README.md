# poll-demo（V7.1）

社区投票系统：GitHub + Cloudflare Pages Functions，纯海外节点，**免 ICP 备案**，无短信成本。
严格对齐《民法典》第 278 条：双 2/3 参与 + 一般双过半 / 重大双 3/4 同意。

## 架构

| 子域 | 项目 | 内容 |
|------|------|------|
| vote.firstblade.site | vote（Pages） | 业主投票前台 |
| admin-vote.firstblade.site | admin（Pages + Access） | 管理后台 |

- 同域 Pages Functions，零 CORS、零独立 Worker
- 生产 / 预览 D1 双库隔离，R2 两桶隔离
- UUID 匿名 + 加盐 SHA-256，云端无明文隐私

## 文件名（全部全局唯一）

```
config.vote.toml / config.admin.toml
api.vote.js / api.admin.js
index.html / admin.html
style.vote.css / style.admin.css
app.vote.js / app.admin.js
hash.vote.js / hash.admin.js
```

## 部署步骤

1. **清理旧资源**：删除旧 Worker、旧 `api-vote` DNS
2. **建资源**：D1 库 `poll-db`（生产 + 预览）、R2 桶 `poll-attachments` + `poll-attachments-preview`
3. **建表**：`wrangler d1 execute poll-db --file=schema.sql`
4. **两个 Pages 项目**关联 GitHub，构建根目录分别为 `frontend/vote`、`frontend/admin`
5. **绑定**（共 8 次）：两项目 × 生产/预览 × (DB / ATTACH_BUCKET)
6. **环境变量**：`HASH_SALT`（必填，≥32位随机）、`ENV=production`
7. **Access**：Zero Trust 面板保护 `admin-vote.firstblade.site`，白名单管理员邮箱
8. **DNS**：两条 CNAME（vote / admin-vote → *.pages.dev，橙色云朵）
9. **骨架验证**：`/api/health` 返回 `db:ok, r2:ok`
10. **全量验证**：下载模板 → 导入台账 → 事项设置 → 投票 → 统计判定 → 删除

## 占位符替换

`config.vote.toml` / `config.admin.toml` 中的 `<PROD_DB_ID>`、`<PREVIEW_DB_ID>` 建库后手动填入。

## 验收清单

- [ ] 两个 `config.*.toml` 占位符已替换
- [ ] Dashboard 绑定 8 次完成
- [ ] `pages_build_output_dir = "."` 两个 toml 都有
- [ ] `/api/health` 返回 ok
- [ ] 导入台账后 `diagnose` 显示正确行数
- [ ] 刚好 50.0% / 66.7% / 75.0% 边界 case 判定正确
