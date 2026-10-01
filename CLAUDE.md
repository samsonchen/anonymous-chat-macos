# 匿名聊天室

一個不用登入的匿名聊天室：前端放在 GitHub Pages，即時傳訊用 Supabase。

## 規則

- 開始任何工作前，先讀 `docs/architecture.md`。
- 目前在「階段二」：前端已經接上 Supabase（`src/backend/supabase.ts`）。沒有設定 Supabase 網址與金鑰時會退回假後端（`mock.ts`）。
- 不可以把金鑰檔案（`.env`、`.env.local` 等）commit 進 git。只有 `.env.example`（只寫變數名稱、沒有值）可以 commit。service_role / secret key 不可以出現在這個專案的任何地方。
