// ===== 公共帮助函数 & 访客页共享配置（被 index.html / login.html / content.html 引用） =====

// 资源定义
const RESOURCES = {
  "1": {
    name: "边玩边赚公众号",
    title: "边玩边赚公众号游戏分享",
    prompt: "密码请前往边玩边赚公众号获取",
    link: "https://mp.weixin.qq.com/s/rzXISAZJSnlEqGWSmPxo_g",
    linkText: "前往「边玩边赚」公众号获取密码",
    qr: "/qrcode.png",
    qrAlt: "边玩边赚公众号二维码",
  },
  "2": {
    name: "得劲滋润爽的B站",
    title: "得劲滋润爽的B站资源分享",
    prompt: "请前往UP主私信获取密码",
    link: "https://space.bilibili.com/34305728",
    linkText: "前往UP主空间私信获取密码",
    qr: "/bilibili.png",
    qrAlt: "得劲滋润爽的B站UP主空间二维码",
  },
};

// 主题色：资源 1 = 微信绿，资源 2 = B站粉
const THEME = {
  "1": { accent: "#07C160", hover: "#06AD56" },
  "2": { accent: "#FB7299", hover: "#F25C8A" },
};

function applyTheme(resource) {
  const t = THEME[resource] || { accent: "#6b7280", hover: "#4b5563" };
  document.documentElement.style.setProperty("--accent", t.accent);
  document.documentElement.style.setProperty("--accent-hover", t.hover);
}

// HTML 转义，防 XSS
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// 复制文本，优先 Clipboard API，失败降级 execCommand
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

// 读取 URL 查询参数
function getQueryParam(name) {
  return new URLSearchParams(location.search).get(name);
}
