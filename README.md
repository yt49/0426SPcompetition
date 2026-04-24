# ダブルペリア集計アプリ

ゴルフコンペの表彰式で、各自がスコアを入力すると即座にダブルペリア方式で順位を計算するアプリ。

## 機能
- 📱 各参加者が自分のスマホからスコア入力
- 🏆 幹事だけが順位を見られる（パスコード保護）
- 🎉 最下位から1位まで1人ずつ発表するセレモニーモード
- ⚙️ パー、隠しホール、HDCP上限などを全部カスタマイズ可能

---

## セットアップ手順

### 0. 前提

- Node.js 18以上がインストールされていること（`node -v` で確認）
- GitHubアカウント
- Supabaseアカウント（無料枠で十分）
- Vercelアカウント（無料枠で十分、デプロイ先）

### 1. Supabase側の準備

#### 1-1. テーブル作成

1. Supabaseダッシュボードを開く → 作成したプロジェクトを選択
2. 左メニューの **SQL Editor** を開く
3. `supabase_schema.sql` の中身を全部コピペ → **RUN** ボタン
4. 「Success」と出ればOK

#### 1-2. APIキーの取得

1. 左メニューの **Settings** → **API** を開く
2. 以下の2つをメモ:
   - **Project URL**（`https://xxxxx.supabase.co` のような形式）
   - **Project API keys** の **anon public**（長いJWT文字列）

---

### 2. ローカル環境のセットアップ

```bash
# このプロジェクトのディレクトリに移動
cd golf-compe

# 依存パッケージをインストール
npm install

# 環境変数ファイルを作成（.env.exampleをコピー）
cp .env.example .env.local
```

`.env.local` を開いて、Supabaseで取得した値に書き換える:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...(長いやつ)
```

### 3. ローカルで動作確認

```bash
npm run dev
```

→ `http://localhost:5173` をブラウザで開く。セットアップ画面が出ればOK。

---

### 4. GitHubにpushする

GitHubで新規リポジトリを作成（空でOK、READMEとか追加しない）。その後:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/golf-compe.git
git push -u origin main
```

⚠️ `.env.local` は `.gitignore` に入ってるのでpushされません（APIキー漏洩防止）

---

### 5. Vercelにデプロイ（公開URLを発行）

1. https://vercel.com にアクセス → GitHubアカウントでログイン
2. **New Project** → GitHubリポジトリ（golf-compe）を選択 → Import
3. **Environment Variables** セクションで以下の2つを追加:
   - `VITE_SUPABASE_URL` = `.env.local` と同じ値
   - `VITE_SUPABASE_ANON_KEY` = `.env.local` と同じ値
4. **Deploy** をクリック
5. 1〜2分でデプロイ完了 → `https://golf-compe-xxxx.vercel.app` のようなURLが発行される
6. そのURLを参加者にLINE等で共有すれば完了

---

## 使い方（当日）

### 幹事（あなた）
1. 事前にデプロイしたURLを開く → **幹事セットアップ** 画面が出る
2. コンペ名、幹事パスコード、パー、隠しホール、上限などを設定して保存
3. 参加者にURLをLINEで共有
4. 閉会式で **幹事モード** → パスコード入力 → 暫定ランキングが見える
5. 揃ったら **🏆 順位発表を開始** → 最下位から1人ずつタップで発表

### 参加者
1. URLを開く
2. **スコアを入力する** → 名前 → 18ホール分のスコア → 送信
3. 修正したい場合は送信後画面の「スコアを修正する」から編集可能

---

## ファイル構成

```
golf-compe/
├── src/
│   ├── App.jsx          ← メインコンポーネント
│   ├── supabase.js      ← Supabaseクライアント＆storageラッパー
│   ├── main.jsx         ← エントリーポイント
│   └── index.css        ← Tailwind＋フォント
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── supabase_schema.sql  ← Supabaseに貼り付けるSQL
├── .env.example         ← 環境変数のテンプレート
└── .gitignore
```

---

## よくある問題

**Q. ローカルで「準備中...」から進まない**
→ `.env.local` の値が正しいか確認。ブラウザのコンソールにエラーが出てないか見る。

**Q. Vercelデプロイ後、本番で動かない**
→ Vercelの環境変数が設定されてるか確認。設定後は再デプロイが必要。

**Q. 計算式を変えたい（×0.8なし、上限36など）**
→ アプリ内の「設定」画面からいつでも変更可能。

**Q. データを消してやり直したい**
→ 幹事ダッシュボードの最下部「全データを削除してリセット」、またはSupabaseのSQL Editorで `DELETE FROM kv;` を実行。

---

## 計算式

```
HDCP = (隠しホール12個のスコア合計 × 1.5 − パー合計) × 0.8
HDCP上限を超える場合は上限適用
Net = Gross − HDCP
```

※ ×0.8、上限値はすべて設定画面で変更可能
