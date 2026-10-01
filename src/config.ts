// 架構文件裡定下的數字，集中放在這裡。
export const NICKNAME_MAX = 12
export const MESSAGE_MAX = 500
export const RECENT_COUNT = 50 // 進入時讀取最近幾則
export const KEEP_COUNT = 200 // 系統只保留最近幾則
export const HEARTBEAT_MS = 10_000 // 多久回報一次「我還在」
export const SWEEP_MS = 10_000 // 多久清掃一次過期成員
export const STALE_MS = 30_000 // 超過多久沒心跳就視為離開
export const NAME_COLOR_COUNT = 8
export const LS_LAST_NICKNAME = 'anon-chat:last-nickname'
export const SS_TAB_SECRET = 'anon-chat:tab-secret'
