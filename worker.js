// Cloudflare Workers 后端 —— 处理 /api/* 并托管前端静态资源
// 存储：D1 (SQLite)，绑定名 DB；单表 kv(k TEXT PRIMARY KEY, v TEXT)
// 前端为纯静态 HTML（public/），由本 Worker 通过 env.ASSETS.fetch 提供服务
//
// 接口与原 EdgeOne 版完全一致，前端代码无需任何改动：
//   GET  /api/status
//   POST /api/auth/admin
//   POST /api/auth/visitor
//   GET  /api/content?resource=1
//   POST /api/admin/content
//   POST /api/admin/content/delete
//   POST /api/admin/password

const DEFAULT_ADMIN = "admin888"
const DEFAULT_VISITOR = "888888"

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-admin-code, x-access-code",
  "access-control-allow-methods": "GET, POST, OPTIONS",
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  })
}

// ---------- D1 读写 ----------
async function getKV(db, key) {
  const row = await db.prepare("SELECT v FROM kv WHERE k = ?").bind(key).first()
  if (!row) return null
  try {
    return JSON.parse(row.v)
  } catch {
    return null
  }
}

async function setKV(db, key, value) {
  const v = JSON.stringify(value)
  await db
    .prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
    .bind(key, v)
    .run()
}

async function getResource(db, resId) {
  let r = await getKV(db, `res:${resId}`)
  if (!r) r = { accessPassword: DEFAULT_VISITOR, content: [] }
  return r
}

async function getPasswords(db) {
  let p = await getKV(db, "passwords")
  if (!p || !p.adminPassword) {
    p = { adminPassword: DEFAULT_ADMIN }
    await setKV(db, "passwords", p)
  }
  return p
}

// 管理后台会话令牌：登录时签发并存 D1，改密码不改令牌，避免活跃会话失步
function genToken() {
  try {
    return crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 10)
  } catch {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  }
}

async function getAdminToken(db) {
  const t = await getKV(db, "admin_session")
  return t || null
}

async function requireAdmin(req, db) {
  const token = await getAdminToken(db)
  return token != null && header(req, "x-admin-code") === token
}

function header(req, name) {
  return req.headers.get(name)
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS 预检（前端带自定义请求头 X-Admin-Code / X-Access-Code，会触发预检）
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }

    // 非 /api/* 一律交给静态资源（同源，不存在 CORS 问题）
    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request)
    }

    try {
      const method = request.method
      const resId = url.searchParams.get("resource") || ""
      let body = {}
      if (method === "POST") {
        try {
          body = await request.json()
        } catch {
          body = {}
        }
      }
      const db = env.DB
      const rid = body.resource || resId

      // GET /api/status —— 探针：确认 D1 已绑定
      if (path === "/api/status" && method === "GET") {
        return json({ d1: true, storage: "d1" })
      }

      // POST /api/auth/admin —— 校验通过后签发会话令牌
      if (path === "/api/auth/admin" && method === "POST") {
        const p = await getPasswords(db)
        if (body.password === p.adminPassword) {
          const token = genToken()
          await setKV(db, "admin_session", token)
          return json({ ok: true, token })
        }
        return json({ error: "管理密码错误" }, 401)
      }

      // POST /api/auth/visitor
      if (path === "/api/auth/visitor" && method === "POST") {
        const r = await getResource(db, rid)
        if (body.password === r.accessPassword) return json({ ok: true })
        return json({ error: "密码错误，请重试" }, 401)
      }

      // GET /api/content  (访客 X-Access-Code 或 管理 X-Admin-Code)
      if (path === "/api/content" && method === "GET") {
        if (!rid) return json({ error: "缺少 resource 参数" }, 400)
        const access = header(request, "x-access-code")
        const admin = header(request, "x-admin-code")
        const r = await getResource(db, rid)
        if (await requireAdmin(req, db)) return json({ items: r.content || [] })
        if (access === r.accessPassword) return json({ items: r.content || [] })
        return json({ error: "密码错误" }, 401)
      }

      // POST /api/admin/content  (新增)
      if (path === "/api/admin/content" && method === "POST") {
        if (!(await requireAdmin(req, db)))
          return json({ error: "未授权" }, 401)
        const r = await getResource(db, rid)
        const item = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          type: body.type === "link" ? "link" : "text",
          title: (body.title || "").trim(),
          content: body.content || "",
          url: body.url || "",
          createdAt: Date.now(),
        }
        if (!item.title) return json({ error: "标题不能为空" }, 400)
        r.content = r.content || []
        r.content.push(item)
        await setKV(db, `res:${rid}`, r)
        return json({ ok: true, item })
      }

      // POST /api/admin/content/delete
      if (path === "/api/admin/content/delete" && method === "POST") {
        if (!(await requireAdmin(req, db)))
          return json({ error: "未授权" }, 401)
        const r = await getResource(db, rid)
        r.content = (r.content || []).filter((it) => it.id !== body.id)
        await setKV(db, `res:${rid}`, r)
        return json({ ok: true })
      }

      // POST /api/admin/password
      if (path === "/api/admin/password" && method === "POST") {
        if (!(await requireAdmin(req, db)))
          return json({ error: "未授权" }, 401)
        if (body.adminPassword != null) {
          const v = String(body.adminPassword)
          if (v.length < 6) return json({ error: "管理密码至少 6 位" }, 400)
          p.adminPassword = v
          await setKV(db, "passwords", p)
          return json({ ok: true })
        }
        if (body.visitorPassword != null) {
          const v = String(body.visitorPassword)
          if (v.length < 4) return json({ error: "访问密码至少 4 位" }, 400)
          const r = await getResource(db, rid)
          r.accessPassword = v
          await setKV(db, `res:${rid}`, r)
          return json({ ok: true })
        }
        return json({ error: "缺少密码字段" }, 400)
      }

      return json({ error: "Not Found: " + path }, 404)
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      return json({ error: "服务器错误：" + msg }, 500)
    }
  },
}
