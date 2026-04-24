import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '⚠️ Supabase環境変数が設定されていません。.env.localファイルを作成し、VITE_SUPABASE_URLとVITE_SUPABASE_ANON_KEYを設定してください。'
  )
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '')

// window.storage互換のAPIラッパー
// これで App.jsx の変更を最小限にできる
export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from('kv')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return { key, value: JSON.stringify(data.value) }
  },

  async set(key, value) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    const { error } = await supabase
      .from('kv')
      .upsert({
        key,
        value: parsed,
        updated_at: new Date().toISOString(),
      })
    if (error) throw error
    return { key, value }
  },

  async delete(key) {
    const { error } = await supabase.from('kv').delete().eq('key', key)
    if (error) throw error
    return { key, deleted: true }
  },

  async list(prefix = '') {
    const { data, error } = await supabase
      .from('kv')
      .select('key')
      .like('key', `${prefix}%`)
    if (error) throw error
    return { keys: (data || []).map((d) => d.key), prefix }
  },
}
