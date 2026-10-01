# 匿名聊天室

不用登入的匿名聊天室。前端放在 GitHub Pages，即時傳訊用 Supabase。

- 設計與決策：`docs/architecture.md`
- 畫面設計：`docs/design.md`
- 目前進度：**階段一**（只有前端，後端是瀏覽器裡的假資料，還沒接 Supabase）

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

## 階段一怎麼測試

- 同一個瀏覽器開兩個以上的分頁，分頁之間會互相看到訊息與上線狀態。不同人、不同裝置之間看不到彼此，這是階段一的限制。
- 網址後面加上 `?dev=1`，左下角會出現「測試工具」：模擬斷線、模擬無法連線、清除示範資料。

## 金鑰

階段一不需要任何金鑰。階段二會用到的設定寫在 `.env.example`，實際的值放 `.env.local`（不會被上傳）。
**service_role / secret key 絕對不要放進這個專案。**
