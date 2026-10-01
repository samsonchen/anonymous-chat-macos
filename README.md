# 匿名聊天室

不用登入的匿名聊天室。前端放在 GitHub Pages，即時傳訊用 Supabase。

- 設計與決策：`docs/architecture.md`
- 畫面設計：`docs/design.md`
- 目前進度：**階段二**（已接上 Supabase）。沒有設定 Supabase 時，網頁會退回瀏覽器裡的假資料。
- 資料庫的建立指令：`supabase/sql/`（貼到 Supabase 後台的 SQL Editor 執行）

## 在自己的電腦上開起來

```
npm install
npm run dev
```

打開 http://localhost:5173/anonymous-chat-macos/ 。

| 指令 | 做什麼 |
|---|---|
| `npm run dev` | 啟動本機預覽 |
| `npm test` | 跑自動測試 |
| `npm run build` | 檢查型別並建置到 `dist/` |
| `npm run preview` | 預覽建置後的結果 |

## 連到哪個後端

- 專案根目錄有 `.env.local`（填入 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`）：連 Supabase，不同人、不同裝置都能互相看到。
- 沒有 `.env.local`：用假後端，只有同一個瀏覽器的多個分頁互通。網址後面加上 `?dev=1`，左下角會出現「測試工具」（模擬斷線、模擬無法連線、清除示範資料），只在假後端有作用。

## 金鑰

用到的設定寫在 `.env.example`，實際的值放 `.env.local`（不會被上傳）。只會用到 Project URL 與公開金鑰（publishable / anon key）。
**service_role / secret key 絕對不要放進這個專案。**
