import React, { useState, useEffect } from 'react'
import { storage } from './supabase.js'

const DEFAULT_PARS = [4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 5, 4, 3, 4, 4, 3, 4, 5]
const DEFAULT_HIDDEN = [2, 5, 7, 12, 15, 3, 9, 14, 17, 4, 11, 16]

const keyFromName = (name) => {
  const bytes = new TextEncoder().encode(name.trim())
  let b64 = btoa(String.fromCharCode(...bytes))
  b64 = b64.replace(/=/g, '').replace(/\//g, '-').replace(/\+/g, '_')
  return `player:${b64}`
}

export default function App() {
  const [view, setView] = useState('loading')
  const [config, setConfig] = useState(null)
  const [players, setPlayers] = useState([])
  const [toast, setToast] = useState('')

  // Player entry
  const [myName, setMyName] = useState('')
  const [myScores, setMyScores] = useState(Array(18).fill(''))
  const [myKey, setMyKey] = useState(null)

  // Admin
  const [adminPass, setAdminPass] = useState('')
  const [adminErr, setAdminErr] = useState('')
  const [revealIdx, setRevealIdx] = useState(-1)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Setup/Settings form
  const [sfPars, setSfPars] = useState([...DEFAULT_PARS])
  const [sfHidden, setSfHidden] = useState([...DEFAULT_HIDDEN])
  const [sfPass, setSfPass] = useState('')
  const [sfEvent, setSfEvent] = useState('ダンロップ杯')

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (view === 'admin-dashboard') {
      const id = setInterval(loadPlayers, 3000)
      return () => clearInterval(id)
    }
  }, [view])

  async function init() {
    try {
      const res = await storage.get('config')
      if (res) {
        const cfg = JSON.parse(res.value)
        setConfig(cfg)
        setSfPars(cfg.pars)
        setSfHidden(cfg.hidden)
        setSfPass(cfg.pass)
        setSfEvent(cfg.eventName)
        await loadPlayers()
        setView('landing')
      } else {
        setView('setup')
      }
    } catch (e) {
      console.error(e)
      setView('setup')
    }
  }

  async function loadPlayers() {
    try {
      const list = await storage.list('player:')
      if (list?.keys?.length) {
        const arr = []
        for (const k of list.keys) {
          try {
            const r = await storage.get(k)
            if (r) arr.push({ key: k, ...JSON.parse(r.value) })
          } catch {}
        }
        setPlayers(arr)
      } else {
        setPlayers([])
      }
    } catch {
      setPlayers([])
    }
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const calc = (scores, cfg = config) => {
    if (!cfg) return null
    const nums = scores.map((s) => parseInt(s) || 0)
    const gross = nums.reduce((a, b) => a + b, 0)
    const hiddenSum = cfg.hidden.reduce((s, h) => s + (nums[h - 1] || 0), 0)
    const parSum = cfg.pars.reduce((a, b) => a + b, 0)
    let hdcp = (hiddenSum * 1.5 - parSum) * 0.8
    if (hdcp < 0) hdcp = 0
    hdcp = Math.round(hdcp * 10) / 10
    const net = Math.round((gross - hdcp) * 10) / 10
    return { gross, hiddenSum, hdcp, net, parSum }
  }

  const ranked = () => {
    if (!config) return []
    return players
      .map((p) => ({ ...p, result: calc(p.scores) }))
      .filter((p) => p.result && p.result.gross > 0)
      .sort((a, b) => a.result.net - b.result.net)
  }

  const toggleHidden = (hole) => {
    if (sfHidden.includes(hole)) {
      setSfHidden(sfHidden.filter((h) => h !== hole))
    } else if (sfHidden.length < 12) {
      setSfHidden([...sfHidden, hole])
    } else {
      showToast('隠しホールは12個まで')
    }
  }

  const randomizeHidden = () => {
    const all = Array.from({ length: 18 }, (_, i) => i + 1)
    const shuffled = [...all].sort(() => Math.random() - 0.5)
    setSfHidden(shuffled.slice(0, 12).sort((a, b) => a - b))
  }

  const saveSetup = async () => {
    if (sfHidden.length !== 12) { showToast('隠しホールは12個選んでください'); return false }
    if (!sfPass.trim()) { showToast('幹事パスコードを入力してください'); return false }
    const cfg = {
      pars: sfPars,
      hidden: [...sfHidden].sort((a, b) => a - b),
      pass: sfPass.trim(), eventName: sfEvent.trim() || 'コンペ',
    }
    try {
      await storage.set('config', JSON.stringify(cfg))
      setConfig(cfg)
      return true
    } catch (e) {
      console.error(e)
      showToast('保存失敗。Supabase接続を確認してください')
      return false
    }
  }

  const updateSettings = async () => {
    if (sfHidden.length !== 12) { showToast('隠しホールは12個'); return }
    const cfg = {
      pars: sfPars,
      hidden: [...sfHidden].sort((a, b) => a - b),
      pass: sfPass.trim() || config.pass,
      eventName: sfEvent.trim() || 'コンペ',
    }
    try {
      await storage.set('config', JSON.stringify(cfg))
      setConfig(cfg)
      showToast('更新しました')
      setSettingsOpen(false)
    } catch { showToast('更新失敗') }
  }

  const submitPlayerScores = async () => {
    for (let i = 0; i < 18; i++) {
      const n = parseInt(myScores[i])
      if (!n || n < 1 || n > 25) {
        showToast(`${i + 1}H のスコアを確認してください`); return
      }
    }
    const key = myKey || keyFromName(myName)
    try {
      await storage.set(key, JSON.stringify({
        name: myName.trim(),
        scores: myScores.map((s) => parseInt(s)),
        submittedAt: Date.now(),
      }))
      setMyKey(key)
      await loadPlayers()
      setView('player-done')
    } catch (e) {
      console.error(e)
      showToast('送信失敗')
    }
  }

  const removePlayer = async (key) => {
    if (!confirm('このプレイヤーの記録を削除しますか？')) return
    try { await storage.delete(key); await loadPlayers() } catch {}
  }

  const resetAll = async () => {
    if (!confirm('全データを削除してリセットしますか？')) return
    try {
      const list = await storage.list('player:')
      if (list?.keys) for (const k of list.keys) { try { await storage.delete(k) } catch {} }
      try { await storage.delete('config') } catch {}
      setPlayers([]); setConfig(null)
      setSfPars([...DEFAULT_PARS]); setSfHidden([...DEFAULT_HIDDEN])
      setSfPass(''); setSfEvent('ダンロップ杯')
      setView('setup')
    } catch {}
  }

  const parTotal = sfPars.reduce((a, b) => a + b, 0)
  const r = ranked()
  const total = r.length
  const currentRankIdx = total - 1 - revealIdx
  const currentReveal = revealIdx >= 0 && revealIdx < total ? r[currentRankIdx] : null
  const currentRank = revealIdx >= 0 ? total - revealIdx : null
  const isFirst = currentRank === 1
  const isDone = revealIdx >= total

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(ellipse at top, #f6f1e3 0%, #e8ddc4 100%)' }}
    >
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-white px-5 py-2.5 rounded-full shadow-xl body-jp text-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* ================= LOADING ================= */}
      {view === 'loading' && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="display-jp text-emerald-900 text-xl animate-fade-in">準備中...</div>
        </div>
      )}

      {/* ================= SETUP ================= */}
      {view === 'setup' && (
        <div className="max-w-xl mx-auto px-5 py-8">
          <div className="text-center mb-7 animate-slide-up">
            <div className="display-en text-amber-700 text-xs tracking-[0.4em] uppercase mb-2">Organizer Setup</div>
            <div className="w-12 h-px bg-amber-700 mx-auto mb-3" />
            <h1 className="display-jp text-3xl text-emerald-950 font-bold">幹事セットアップ</h1>
            <p className="body-jp text-stone-600 text-xs mt-3">最初に幹事が設定します。参加者は設定不要</p>
          </div>

          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 shadow-lg border border-stone-200 space-y-5 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div>
              <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em] mb-1.5 block">コンペ名</label>
              <input type="text" value={sfEvent} onChange={(e) => setSfEvent(e.target.value)}
                className="body-jp w-full px-4 py-3 bg-stone-50 rounded-lg border border-stone-300 focus:border-emerald-700 focus:outline-none text-sm" />
            </div>

            <div>
              <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em] mb-1.5 block">幹事パスコード <span className="text-stone-500 normal-case tracking-normal font-normal">（順位閲覧用）</span></label>
              <input type="text" value={sfPass} onChange={(e) => setSfPass(e.target.value)}
                placeholder="例: kanji2026"
                className="body-jp w-full px-4 py-3 bg-stone-50 rounded-lg border border-stone-300 focus:border-emerald-700 focus:outline-none text-sm" />
            </div>

            <div>
              <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em] mb-2 block">
                各ホールのパー <span className="text-stone-500 normal-case tracking-normal font-normal">合計 {parTotal}</span>
              </label>
              <div className="grid grid-cols-9 gap-1">
                {sfPars.slice(0, 9).map((p, i) => (
                  <div key={i} className="text-center">
                    <div className="text-[9px] text-stone-500 body-jp">{i + 1}</div>
                    <select value={p} onChange={(e) => { const np = [...sfPars]; np[i] = parseInt(e.target.value); setSfPars(np) }}
                      className="w-full body-jp text-sm py-1 border border-stone-300 rounded bg-white">
                      <option>3</option><option>4</option><option>5</option><option>6</option>
                    </select>
                  </div>
                ))}
              </div>
              <div className="text-[9px] body-jp text-stone-500 text-center my-1">OUT {sfPars.slice(0, 9).reduce((a, b) => a + b, 0)}</div>
              <div className="grid grid-cols-9 gap-1">
                {sfPars.slice(9).map((p, i) => (
                  <div key={i + 9} className="text-center">
                    <div className="text-[9px] text-stone-500 body-jp">{i + 10}</div>
                    <select value={p} onChange={(e) => { const np = [...sfPars]; np[i + 9] = parseInt(e.target.value); setSfPars(np) }}
                      className="w-full body-jp text-sm py-1 border border-stone-300 rounded bg-white">
                      <option>3</option><option>4</option><option>5</option><option>6</option>
                    </select>
                  </div>
                ))}
              </div>
              <div className="text-[9px] body-jp text-stone-500 text-center mt-1">IN {sfPars.slice(9).reduce((a, b) => a + b, 0)}</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em]">
                  隠しホール {sfHidden.length}/12
                </label>
                <button onClick={randomizeHidden} className="body-jp text-[11px] text-emerald-800 underline">ランダム選択</button>
              </div>
              <div className="grid grid-cols-9 gap-1.5">
                {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => {
                  const selected = sfHidden.includes(hole)
                  return (
                    <button key={hole} onClick={() => toggleHidden(hole)}
                      className={`aspect-square rounded-md body-jp text-sm font-bold transition ${selected ? 'bg-emerald-800 text-amber-100 shadow' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                      {hole}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 body-jp text-[11px] text-stone-700 leading-relaxed">
              <strong className="text-stone-900">計算式:</strong> HDCP = (隠し12H合計 × 1.5 − {parTotal}) × 0.8（上限なし）
            </div>

            <button onClick={async () => { const ok = await saveSetup(); if (ok) setView('landing') }}
              className="body-jp w-full py-4 bg-emerald-800 hover:bg-emerald-900 text-amber-100 rounded-lg font-bold tracking-[0.15em] transition shadow-lg">
              セットアップ完了 →
            </button>
          </div>
        </div>
      )}

      {/* ================= LANDING ================= */}
      {view === 'landing' && (
        <div className="max-w-md mx-auto min-h-screen flex flex-col px-5 py-8">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="animate-slide-up">
              <div className="display-en text-amber-700 text-[11px] tracking-[0.5em] uppercase mb-3">Double Peria</div>
              <div className="w-14 h-px bg-amber-700 mx-auto mb-5" />
              <h1 className="display-jp text-4xl text-emerald-950 font-bold leading-tight">
                {config?.eventName || 'コンペ'}
              </h1>
              <p className="body-jp text-stone-600 text-xs mt-4 tracking-widest">ダブルペリア 集計</p>
            </div>

            <div className="w-full mt-10 space-y-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
              <button onClick={() => { setMyName(''); setMyScores((config?.pars || DEFAULT_PARS).map(String)); setMyKey(null); setView('player-name') }}
                className="body-jp w-full py-5 bg-emerald-800 hover:bg-emerald-900 text-amber-100 rounded-xl font-bold tracking-[0.15em] transition shadow-lg text-base">
                スコアを入力する
              </button>
              <button onClick={() => { setAdminPass(''); setAdminErr(''); setView('admin-auth') }}
                className="body-jp w-full py-3 bg-transparent border border-stone-400 text-stone-700 rounded-xl hover:bg-stone-100/60 transition text-sm">
                幹事モード
              </button>
            </div>
          </div>

          <div className="text-center mt-6 body-jp text-[10px] text-stone-500 tracking-widest">
            提出済み {players.length} 名
          </div>
        </div>
      )}

      {/* ================= PLAYER NAME ================= */}
      {view === 'player-name' && (
        <div className="max-w-md mx-auto px-5 py-6 min-h-screen flex flex-col">
          <button onClick={() => setView('landing')} className="body-jp text-sm text-stone-600 mb-6 self-start">← 戻る</button>
          <div className="flex-1 flex flex-col justify-center">
            <div className="animate-slide-up">
              <div className="display-en text-amber-700 text-[10px] tracking-[0.4em] uppercase mb-2">Step 1 of 2</div>
              <h2 className="display-jp text-2xl text-emerald-950 font-bold mb-1">お名前</h2>
              <p className="body-jp text-stone-600 text-xs mb-5">スコアカード通りに入力してください</p>
              <input type="text" value={myName} onChange={(e) => setMyName(e.target.value)}
                placeholder="山田 太郎"
                className="body-jp w-full px-5 py-4 bg-white rounded-xl border-2 border-stone-200 focus:border-emerald-700 focus:outline-none text-lg shadow-sm"
                autoFocus />
              <button onClick={() => { if (!myName.trim()) { showToast('名前を入力してください'); return } setView('player-scores') }}
                className="body-jp w-full mt-5 py-4 bg-emerald-800 hover:bg-emerald-900 text-amber-100 rounded-xl font-bold tracking-[0.15em] transition shadow-lg">
                スコア入力へ →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PLAYER SCORES ================= */}
      {view === 'player-scores' && (() => {
        const gross = myScores.reduce((a, b) => a + (parseInt(b) || 0), 0)
        const filled = myScores.filter((s) => s !== '' && parseInt(s) > 0).length
        const setScore = (i, v) => { const s = [...myScores]; s[i] = v; setMyScores(s) }
        const bump = (i, d) => { const cur = parseInt(myScores[i]) || (config?.pars[i] || 4); const nv = Math.max(1, Math.min(25, cur + d)); setScore(i, String(nv)) }
        const row = (i) => {
          const par = config?.pars[i] || 4
          return (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <div className="w-10 flex-shrink-0">
                <div className="body-jp text-[10px] text-stone-500 leading-none">HOLE</div>
                <div className="display-en text-emerald-950 text-lg font-bold leading-tight">{i + 1}</div>
              </div>
              <div className="w-12 flex-shrink-0 body-jp text-[11px] text-stone-500">Par {par}</div>
              <button onClick={() => bump(i, -1)} className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 body-jp text-lg font-bold flex items-center justify-center transition">−</button>
              <input type="number" inputMode="numeric" value={myScores[i]}
                onChange={(e) => setScore(i, e.target.value)}
                placeholder="?"
                className="flex-1 h-10 text-center body-jp text-xl font-bold rounded-lg border-2 border-stone-200 focus:border-emerald-700 focus:outline-none bg-white min-w-0" />
              <button onClick={() => bump(i, 1)} className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 body-jp text-lg font-bold flex items-center justify-center transition">＋</button>
            </div>
          )
        }
        return (
          <div className="max-w-md mx-auto px-5 py-6 pb-32">
            <button onClick={() => setView('player-name')} className="body-jp text-sm text-stone-600 mb-4">← 戻る</button>
            <div className="mb-5">
              <div className="display-en text-amber-700 text-[10px] tracking-[0.4em] uppercase mb-1">Step 2 of 2</div>
              <h2 className="display-jp text-2xl text-emerald-950 font-bold">{myName} さん</h2>
              <p className="body-jp text-stone-600 text-xs mt-1">18ホール分のスコアを入力</p>
            </div>

            <div className="bg-white/80 backdrop-blur rounded-2xl p-4 shadow-lg border border-stone-200 space-y-1">
              <div className="display-en text-stone-500 text-[10px] tracking-[0.4em] uppercase mb-1 px-2">OUT</div>
              {Array.from({ length: 9 }, (_, i) => row(i))}
              <div className="h-px bg-stone-200 my-3" />
              <div className="display-en text-stone-500 text-[10px] tracking-[0.4em] uppercase mb-1 px-2">IN</div>
              {Array.from({ length: 9 }, (_, i) => row(i + 9))}

              <div className="border-t border-stone-200 pt-4 mt-4 flex justify-between items-baseline px-2">
                <div className="body-jp text-sm text-stone-600">Gross</div>
                <div>
                  <span className="display-en text-emerald-950 text-3xl font-bold">{gross}</span>
                  <span className="body-jp text-xs text-stone-500 ml-2">{filled}/18 H</span>
                </div>
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#efe7d4] via-[#efe7d4] to-transparent">
              <div className="max-w-md mx-auto">
                <button onClick={submitPlayerScores} disabled={filled < 18}
                  className="body-jp w-full py-4 bg-emerald-800 hover:bg-emerald-900 disabled:bg-stone-300 disabled:cursor-not-allowed text-amber-100 rounded-xl font-bold tracking-[0.15em] transition shadow-xl">
                  {filled < 18 ? `あと ${18 - filled} ホール` : '送信する →'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ================= PLAYER DONE ================= */}
      {view === 'player-done' && (() => {
        const res = calc(myScores)
        return (
          <div className="max-w-md mx-auto px-5 py-8 min-h-screen flex flex-col justify-center">
            <div className="text-center animate-slide-up">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-800 flex items-center justify-center text-amber-100 text-3xl">✓</div>
              <div className="display-en text-amber-700 text-[10px] tracking-[0.4em] uppercase mb-1">Submitted</div>
              <h2 className="display-jp text-2xl text-emerald-950 font-bold mb-2">送信完了</h2>
              <p className="body-jp text-stone-600 text-sm mb-8">{myName} さん、ありがとうございます</p>

              <div className="bg-white/80 rounded-2xl p-6 shadow-lg border border-stone-200 mx-auto max-w-sm">
                <div className="flex justify-around items-center">
                  <div>
                    <div className="display-en text-amber-700 text-[10px] tracking-[0.3em] uppercase mb-1">Gross</div>
                    <div className="display-en text-emerald-950 text-4xl font-bold">{res?.gross}</div>
                  </div>
                  <div className="w-px h-12 bg-stone-200" />
                  <div>
                    <div className="display-en text-amber-700 text-[10px] tracking-[0.3em] uppercase mb-1">HDCP</div>
                    <div className="display-en text-stone-700 text-4xl font-bold">{res?.hdcp.toFixed(1)}</div>
                  </div>
                  <div className="w-px h-12 bg-stone-200" />
                  <div>
                    <div className="display-en text-amber-700 text-[10px] tracking-[0.3em] uppercase mb-1">Net</div>
                    <div className="display-en text-emerald-900 text-4xl font-bold">{res?.net.toFixed(1)}</div>
                  </div>
                </div>
              </div>

              <p className="body-jp text-stone-500 text-xs mt-6">順位は幹事からの発表をお待ちください</p>

              <div className="mt-8 space-y-2">
                <button onClick={() => setView('player-scores')}
                  className="body-jp w-full py-3 bg-white border border-stone-300 text-stone-700 rounded-xl hover:bg-stone-50 transition text-sm">
                  スコアを修正する
                </button>
                <button onClick={() => setView('landing')}
                  className="body-jp w-full py-3 text-stone-500 text-sm">
                  トップに戻る
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ================= ADMIN AUTH ================= */}
      {view === 'admin-auth' && (
        <div className="max-w-md mx-auto px-5 py-6 min-h-screen flex flex-col">
          <button onClick={() => setView('landing')} className="body-jp text-sm text-stone-600 mb-6 self-start">← 戻る</button>
          <div className="flex-1 flex flex-col justify-center">
            <div className="animate-slide-up">
              <div className="display-en text-amber-700 text-[10px] tracking-[0.4em] uppercase mb-2">Organizer</div>
              <h2 className="display-jp text-2xl text-emerald-950 font-bold mb-5">幹事パスコード</h2>
              <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { if (adminPass === config?.pass) setView('admin-dashboard'); else setAdminErr('パスコードが違います') } }}
                placeholder="パスコードを入力"
                className="body-jp w-full px-5 py-4 bg-white rounded-xl border-2 border-stone-200 focus:border-emerald-700 focus:outline-none text-lg shadow-sm"
                autoFocus />
              {adminErr && <p className="body-jp text-red-600 text-sm mt-2">{adminErr}</p>}
              <button onClick={() => { if (adminPass === config?.pass) setView('admin-dashboard'); else setAdminErr('パスコードが違います') }}
                className="body-jp w-full mt-5 py-4 bg-emerald-800 hover:bg-emerald-900 text-amber-100 rounded-xl font-bold tracking-[0.15em] transition shadow-lg">
                ログイン
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADMIN DASHBOARD ================= */}
      {view === 'admin-dashboard' && (
        <div className="max-w-2xl mx-auto px-5 py-6 pb-12">
          <div className="flex items-start justify-between mb-5 animate-slide-up">
            <div>
              <div className="display-en text-amber-700 text-[10px] tracking-[0.4em] uppercase mb-1">Organizer Dashboard</div>
              <h2 className="display-jp text-xl text-emerald-950 font-bold">{config?.eventName}</h2>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSettingsOpen(true)}
                className="body-jp text-[11px] bg-white border border-stone-300 px-3 py-2 rounded-lg hover:bg-stone-50 transition">⚙ 設定</button>
              <button onClick={() => setView('landing')}
                className="body-jp text-[11px] bg-white border border-stone-300 px-3 py-2 rounded-lg hover:bg-stone-50 transition">退出</button>
            </div>
          </div>

          <div className="bg-white/80 rounded-2xl shadow-lg border border-stone-200 overflow-hidden mb-4 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <div className="bg-emerald-950 text-amber-100 px-4 py-2.5 flex items-center justify-between">
              <div className="body-jp text-sm font-bold tracking-[0.15em]">暫定ランキング</div>
              <div className="body-jp text-[11px] opacity-80">{r.length}名 提出</div>
            </div>
            {r.length === 0 ? (
              <div className="p-8 text-center body-jp text-sm text-stone-500">まだ提出がありません</div>
            ) : (
              <table className="w-full body-jp text-sm">
                <thead>
                  <tr className="bg-stone-50 text-stone-600 text-[10px] uppercase tracking-[0.15em]">
                    <th className="py-2.5 px-2 text-center">順位</th>
                    <th className="py-2.5 px-3 text-left">名前</th>
                    <th className="py-2.5 px-2 text-right">Gross</th>
                    <th className="py-2.5 px-2 text-right">HDCP</th>
                    <th className="py-2.5 px-2 text-right">Net</th>
                    <th className="py-2.5 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {r.map((p, i) => (
                    <tr key={p.key} className={`border-t border-stone-100 ${i === 0 ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-3 px-2 text-center">
                        <span className={`display-en font-bold ${i === 0 ? 'text-amber-700 text-lg' : 'text-emerald-950'}`}>{i + 1}</span>
                      </td>
                      <td className="py-3 px-3 text-stone-900">{p.name}</td>
                      <td className="py-3 px-2 text-right text-stone-700 display-en">{p.result.gross}</td>
                      <td className="py-3 px-2 text-right text-stone-700 display-en">{p.result.hdcp.toFixed(1)}</td>
                      <td className="py-3 px-2 text-right font-bold text-emerald-950 display-en">{p.result.net.toFixed(1)}</td>
                      <td className="py-3 px-2 text-right">
                        <button onClick={() => removePlayer(p.key)} className="text-red-500 text-[10px]">削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <button onClick={() => { setRevealIdx(-1); setView('admin-reveal') }} disabled={r.length === 0}
            className="body-jp w-full py-4 bg-amber-700 hover:bg-amber-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-amber-50 rounded-xl font-bold tracking-[0.15em] transition shadow-lg mb-3">
            🏆 順位発表を開始
          </button>

          <button onClick={loadPlayers}
            className="body-jp w-full py-2.5 bg-white border border-stone-300 text-stone-700 rounded-xl hover:bg-stone-50 transition text-xs mb-4">
            最新の状況に更新 (3秒ごと自動更新)
          </button>

          <details className="bg-white/50 rounded-lg p-3">
            <summary className="body-jp cursor-pointer text-stone-600 text-xs">計算式・隠しホールの詳細</summary>
            <div className="mt-3 body-jp text-[11px] text-stone-700 space-y-1.5 leading-relaxed">
              <div><strong>隠し12H:</strong> {config?.hidden.join(', ')}</div>
              <div><strong>パー合計:</strong> {config?.pars.reduce((a, b) => a + b, 0)}</div>
              <div><strong>計算式:</strong> (隠し12H合計 × 1.5 − {config?.pars.reduce((a, b) => a + b, 0)}) × 0.8（上限なし）</div>
            </div>
          </details>

          <button onClick={resetAll} className="body-jp w-full mt-4 py-2 text-red-600 text-[11px] underline">
            全データを削除してリセット
          </button>

          {settingsOpen && (
            <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="bg-emerald-950 text-amber-100 px-5 py-3 flex items-center justify-between sticky top-0 z-10">
                  <div className="body-jp text-sm font-bold tracking-[0.15em]">設定変更</div>
                  <button onClick={() => setSettingsOpen(false)} className="text-amber-100 text-xl leading-none">×</button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em] mb-1.5 block">コンペ名</label>
                    <input type="text" value={sfEvent} onChange={(e) => setSfEvent(e.target.value)}
                      className="body-jp w-full px-4 py-3 bg-stone-50 rounded-lg border border-stone-300 text-sm" />
                  </div>

                  <div>
                    <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em] mb-2 block">各ホールのパー</label>
                    <div className="grid grid-cols-9 gap-1">
                      {sfPars.slice(0, 9).map((p, i) => (
                        <div key={i} className="text-center">
                          <div className="text-[9px] text-stone-500 body-jp">{i + 1}</div>
                          <select value={p} onChange={(e) => { const np = [...sfPars]; np[i] = parseInt(e.target.value); setSfPars(np) }}
                            className="w-full body-jp text-sm py-1 border border-stone-300 rounded bg-white">
                            <option>3</option><option>4</option><option>5</option><option>6</option>
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-9 gap-1 mt-1">
                      {sfPars.slice(9).map((p, i) => (
                        <div key={i + 9} className="text-center">
                          <div className="text-[9px] text-stone-500 body-jp">{i + 10}</div>
                          <select value={p} onChange={(e) => { const np = [...sfPars]; np[i + 9] = parseInt(e.target.value); setSfPars(np) }}
                            className="w-full body-jp text-sm py-1 border border-stone-300 rounded bg-white">
                            <option>3</option><option>4</option><option>5</option><option>6</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em]">隠しホール {sfHidden.length}/12</label>
                      <button onClick={randomizeHidden} className="body-jp text-[11px] text-emerald-800 underline">ランダム</button>
                    </div>
                    <div className="grid grid-cols-9 gap-1.5">
                      {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => {
                        const selected = sfHidden.includes(hole)
                        return (
                          <button key={hole} onClick={() => toggleHidden(hole)}
                            className={`aspect-square rounded-md body-jp text-sm font-bold ${selected ? 'bg-emerald-800 text-amber-100' : 'bg-stone-100 text-stone-600'}`}>
                            {hole}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="body-jp text-[10px] font-bold text-stone-700 uppercase tracking-[0.2em] mb-1.5 block">幹事パスコード変更（空欄で変更なし）</label>
                    <input type="text" value={sfPass} onChange={(e) => setSfPass(e.target.value)}
                      className="body-jp w-full px-4 py-3 bg-stone-50 rounded-lg border border-stone-300 text-sm" />
                  </div>

                  <button onClick={updateSettings}
                    className="body-jp w-full py-4 bg-emerald-800 text-amber-100 rounded-xl font-bold tracking-[0.15em] shadow-lg">
                    設定を更新
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= ADMIN REVEAL ================= */}
      {view === 'admin-reveal' && (
        <div className="min-h-screen flex flex-col">
          <div className="max-w-2xl mx-auto w-full px-5 py-4 flex items-center justify-between">
            <button onClick={() => { setView('admin-dashboard'); setRevealIdx(-1) }} className="body-jp text-sm text-stone-600">← 戻る</button>
            {revealIdx >= 0 && !isDone && (
              <div className="body-jp text-[11px] text-stone-500 tracking-widest">{revealIdx + 1} / {total}</div>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
            {revealIdx === -1 && (
              <div className="text-center animate-fade-in">
                <div className="display-en text-amber-700 text-xs tracking-[0.5em] uppercase mb-3">Award Ceremony</div>
                <div className="w-14 h-px bg-amber-700 mx-auto mb-5" />
                <h1 className="display-jp text-5xl text-emerald-950 font-bold mb-4">表彰式</h1>
                <p className="body-jp text-stone-600 text-sm mb-10 tracking-wide">
                  {config?.eventName}<br />
                  ただいまより結果発表を行います
                </p>
                <button onClick={() => setRevealIdx(revealIdx + 1)}
                  className="body-jp px-10 py-4 bg-emerald-800 text-amber-100 rounded-xl font-bold tracking-[0.2em] shadow-xl hover:bg-emerald-900 transition">
                  発表を開始 →
                </button>
                <p className="body-jp text-[11px] text-stone-500 mt-5 tracking-wider">最下位から発表します</p>
              </div>
            )}

            {revealIdx >= 0 && !isDone && currentReveal && (
              <div key={revealIdx} className="text-center max-w-lg w-full">
                {isFirst && <div className="text-6xl mb-3 animate-scale-in">🏆</div>}
                <div className="display-en text-amber-700 text-[11px] tracking-[0.5em] uppercase mb-2 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                  {isFirst ? 'Champion' : `Rank No. ${currentRank}`}
                </div>
                <div className={`display-jp font-bold animate-scale-in ${isFirst ? 'text-7xl' : 'text-6xl'} mb-5`}
                  style={{ animationDelay: '0.3s', color: isFirst ? '#b8935a' : '#0a3d2b' }}>
                  第 {currentRank} 位
                </div>
                <div className="w-20 h-px bg-amber-700/60 mx-auto mb-6 animate-fade-in" style={{ animationDelay: '0.5s' }} />
                <div className="display-jp text-4xl text-emerald-950 font-bold mb-6 animate-slide-up" style={{ animationDelay: '0.7s' }}>
                  {currentReveal.name}
                </div>
                <div className="bg-white/80 rounded-2xl p-5 shadow-lg border border-stone-200 animate-slide-up" style={{ animationDelay: '1.0s' }}>
                  <div className="flex justify-around items-center">
                    <div>
                      <div className="display-en text-stone-500 text-[10px] tracking-[0.3em] uppercase mb-1">Net</div>
                      <div className="display-en text-emerald-950 text-3xl font-bold">{currentReveal.result.net.toFixed(1)}</div>
                    </div>
                    <div className="w-px h-10 bg-stone-200" />
                    <div>
                      <div className="display-en text-stone-500 text-[10px] tracking-[0.3em] uppercase mb-1">Gross</div>
                      <div className="display-en text-stone-700 text-3xl font-bold">{currentReveal.result.gross}</div>
                    </div>
                    <div className="w-px h-10 bg-stone-200" />
                    <div>
                      <div className="display-en text-stone-500 text-[10px] tracking-[0.3em] uppercase mb-1">HDCP</div>
                      <div className="display-en text-stone-700 text-3xl font-bold">{currentReveal.result.hdcp.toFixed(1)}</div>
                    </div>
                  </div>
                </div>
                <button onClick={() => setRevealIdx(revealIdx + 1)}
                  className="body-jp mt-8 px-8 py-3 bg-emerald-800 text-amber-100 rounded-xl font-bold tracking-[0.2em] shadow-lg hover:bg-emerald-900 transition">
                  {isFirst ? '終了 →' : '次の発表 →'}
                </button>
              </div>
            )}

            {isDone && (
              <div className="text-center animate-fade-in">
                <div className="display-en text-amber-700 text-xs tracking-[0.5em] uppercase mb-3">Fin.</div>
                <h2 className="display-jp text-3xl text-emerald-950 font-bold mb-3">表彰式 終了</h2>
                <p className="body-jp text-stone-600 text-sm mb-8">お疲れ様でした</p>
                <button onClick={() => { setView('admin-dashboard'); setRevealIdx(-1) }}
                  className="body-jp px-6 py-3 bg-white border border-stone-300 text-stone-700 rounded-xl hover:bg-stone-50 transition text-sm">
                  ダッシュボードへ
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
