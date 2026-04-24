-- ============================================================
-- ダブルペリア集計アプリ用のテーブル作成SQL
-- ============================================================
-- Supabaseダッシュボード → SQL Editor に貼り付けて RUN してください

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 検索を高速化するためのインデックス（プレイヤー一覧取得時に使用）
CREATE INDEX IF NOT EXISTS kv_key_prefix_idx ON kv (key text_pattern_ops);

-- ============================================================
-- RLS (Row Level Security) について
-- ============================================================
-- 一回のコンペでしか使わないのでRLSはOFFのままでOK
-- もし気になる場合は以下のコメントを外して有効化してください

-- ALTER TABLE kv ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_all_reads" ON kv FOR SELECT USING (true);
-- CREATE POLICY "allow_all_writes" ON kv FOR INSERT WITH CHECK (true);
-- CREATE POLICY "allow_all_updates" ON kv FOR UPDATE USING (true) WITH CHECK (true);
-- CREATE POLICY "allow_all_deletes" ON kv FOR DELETE USING (true);
