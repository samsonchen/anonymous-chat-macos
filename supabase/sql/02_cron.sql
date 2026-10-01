-- 每 10 秒清掃一次「超過 30 秒沒有心跳」的人（寫「離開」提示、釋出代號）。
-- 在 01_chat.sql 成功之後，另外貼上執行。分開是因為「每 10 秒」是否支援要看你的專案，
-- 萬一這份失敗，不會影響 01_chat.sql。
-- 就算沒有這份，有人進入時也會先清掃一次，所以代號重複的判斷不受影響；只是「離開」提示會晚出現。

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('sweep-stale-members', '10 seconds', 'select public.sweep_stale()');

-- 檢查：應該看到一列，schedule 是「10 seconds」，active 是 true。
select jobid, jobname, schedule, active from cron.job where jobname = 'sweep-stale-members';

-- 如果上面的 cron.schedule 回報不支援「10 seconds」，改用每分鐘：
-- select cron.schedule('sweep-stale-members', '* * * * *', 'select public.sweep_stale()');
