-- 初始表结构：单表 kv 存储（key 唯一，value 为 JSON 文本）
-- 对应原项目的 MySQL `kv(k, v)` 表，迁移后数据模型完全一致

CREATE TABLE IF NOT EXISTS kv (
  k VARCHAR(191) PRIMARY KEY,
  v TEXT NOT NULL
);

-- 预置管理密码（与原默认 admin888 一致，首次登录后可改）
INSERT INTO kv (k, v) VALUES ('passwords', '{"adminPassword":"admin888"}')
ON CONFLICT(k) DO NOTHING;
