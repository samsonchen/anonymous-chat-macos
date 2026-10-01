import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages 的網址是 https://samsonchen.github.io/anonymous-chat-macos/
// 網站不在根目錄，所以要告訴 Vite 所有檔案的路徑前綴，否則發佈後網頁會一片空白。
export default defineConfig({
  base: '/anonymous-chat-macos/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
