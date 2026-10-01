-- 匿名聊天室：資料表、權限規則、資料庫函式、保留 200 則、即時通知。
-- 在 Supabase 後台 SQL Editor 整份貼上執行。可以重複執行（不會重複建立，也不會清掉資料）。
-- 說明見 docs/architecture.md 第 4、5、8、9 節。

-- =====================================================================
-- 1. 資料表
-- =====================================================================

-- 訊息（含進出提示）。公開可讀。
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('chat', 'join', 'leave')),
  nickname   text not null check (char_length(nickname) between 1 and 12),
  body       text,
  created_at timestamptz not null default now(),
  constraint messages_body_matches_kind check (
    (kind = 'chat' and body is not null and char_length(body) between 1 and 500)
    or (kind <> 'chat' and body is null)
  )
);

-- 目前在線的人。公開可讀（給線上名單用）。
create table if not exists public.members (
  nickname_key text primary key,            -- 去空白、轉小寫後的代號，用來判斷重複
  nickname     text not null,               -- 顯示用，保留原本大小寫
  joined_at    timestamptz not null default now()
);

-- 每個在線者的暗碼與心跳。不公開，前端讀不到。
-- 分開存放，是因為即時通知會把整列資料推給所有訂閱者，暗碼不能放在會被推出去的表裡。
create table if not exists public.member_secrets (
  nickname_key text primary key references public.members (nickname_key) on delete cascade,
  tab_secret   text not null,
  last_seen    timestamptz not null default now()
);

-- =====================================================================
-- 2. 權限：前端（anon）只能讀 messages 與 members，其他一律不行
-- =====================================================================

alter table public.messages       enable row level security;
alter table public.members        enable row level security;
alter table public.member_secrets enable row level security;

revoke all on public.messages, public.members, public.member_secrets from anon, authenticated;
grant select on public.messages, public.members to anon, authenticated;

drop policy if exists "任何人都能讀訊息" on public.messages;
create policy "任何人都能讀訊息" on public.messages
  for select to anon, authenticated using (true);

drop policy if exists "任何人都能讀線上名單" on public.members;
create policy "任何人都能讀線上名單" on public.members
  for select to anon, authenticated using (true);

-- member_secrets 沒有任何政策，也沒有任何授權：前端完全讀不到、寫不到。

-- =====================================================================
-- 3. 內部小工具（前端不能呼叫）
-- =====================================================================

-- 去掉前後的空白（含全形空白、不換行空白）。
create or replace function public._trim(p text)
returns text language sql immutable
as $$ select btrim(p, E' \t\r\n 　') $$;

-- 代號規則：1～12 個字、不含看不見的字元、不能全是空白。
-- emoji 用的零寬連字（U+200D）與變體選擇符（U+FE0E、U+FE0F）不擋。
create or replace function public._nick_ok(p text)
returns boolean language sql immutable
as $$
  select p is not null
     and char_length(p) between 1 and 12
     and p !~ '[\u0001-\u001F\u007F-\u009F­ᅟᅠ᠎​-‌‎-‏ -‮⁠-⁯⠀ㅤ﻿￹-￻]'
     and p ~ '[^\s   -   　]'
$$;

-- 清掉超過 30 秒沒有心跳的人，並各寫一則「離開」。由 pg_cron 每 10 秒呼叫，進入時也會先呼叫一次。
create or replace function public.sweep_stale()
returns void language plpgsql security definer set search_path = public
as $$
begin
  with gone as (
    delete from public.members m
    using public.member_secrets s
    where s.nickname_key = m.nickname_key
      and s.last_seen < now() - interval '30 seconds'
    returning m.nickname
  )
  insert into public.messages (kind, nickname)
  select 'leave', nickname from gone;
end
$$;

-- =====================================================================
-- 4. 前端可以呼叫的函式。所有寫入都走這裡，規則在這裡檢查。
-- =====================================================================

-- 進入。回傳 {ok:true} 或 {ok:false, reason:'taken'|'invalid'}
create or replace function public.join_room(p_nickname text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_nick    text := public._trim(p_nickname);
  v_key     text;
  v_current text;
begin
  if p_secret is null or char_length(p_secret) not between 8 and 100
     or not coalesce(public._nick_ok(v_nick), false) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  v_key := lower(v_nick);

  perform public.sweep_stale();

  select tab_secret into v_current
    from public.member_secrets where nickname_key = v_key for update;
  if found then
    if v_current = p_secret then
      -- 同一個分頁重新整理或重新連線：直接接手，不產生進出提示。
      update public.member_secrets set last_seen = now() where nickname_key = v_key;
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  insert into public.members (nickname_key, nickname) values (v_key, v_nick)
    on conflict (nickname_key) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'taken'); -- 同一瞬間被別人搶先
  end if;
  insert into public.member_secrets (nickname_key, tab_secret) values (v_key, p_secret);
  insert into public.messages (kind, nickname) values ('join', v_nick);
  return jsonb_build_object('ok', true);
end
$$;

-- 心跳（每 10 秒一次）。回傳 {ok:true} 或 {ok:false, reason:'not_member'}
create or replace function public.heartbeat(p_nickname text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  update public.member_secrets set last_seen = now()
   where nickname_key = lower(public._trim(p_nickname)) and tab_secret = p_secret;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- 送訊息。發言者的代號由這裡從成員資料查出，不採用前端傳來的名字，所以不能冒名。
-- 回傳 {ok:true} 或 {ok:false, reason:'not_member'|'empty'|'too_long'}
create or replace function public.send_message(p_nickname text, p_secret text, p_body text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_key  text := lower(public._trim(p_nickname));
  v_nick text;
  v_body text := public._trim(p_body);
begin
  select m.nickname into v_nick
    from public.members m
    join public.member_secrets s on s.nickname_key = m.nickname_key
   where m.nickname_key = v_key and s.tab_secret = p_secret;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_body is null or v_body = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if char_length(v_body) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;

  update public.member_secrets set last_seen = now() where nickname_key = v_key;
  insert into public.messages (kind, nickname, body) values ('chat', v_nick, v_body);
  return jsonb_build_object('ok', true);
end
$$;

-- 離開。立刻釋出代號並寫一則「離開」。沒有這個人也不算錯。
create or replace function public.leave_room(p_nickname text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_nick text;
begin
  delete from public.members m
   using public.member_secrets s
   where s.nickname_key = m.nickname_key
     and m.nickname_key = lower(public._trim(p_nickname))
     and s.tab_secret = p_secret
  returning m.nickname into v_nick;
  if found then
    insert into public.messages (kind, nickname) values ('leave', v_nick);
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- 函式的執行權限：前端只能呼叫上面四個；內部小工具與清掃不開放。
revoke all on function public._trim(text)                         from public, anon, authenticated;
revoke all on function public._nick_ok(text)                      from public, anon, authenticated;
revoke all on function public.sweep_stale()                       from public, anon, authenticated;
revoke all on function public.join_room(text, text)               from public, anon, authenticated;
revoke all on function public.heartbeat(text, text)               from public, anon, authenticated;
revoke all on function public.send_message(text, text, text)      from public, anon, authenticated;
revoke all on function public.leave_room(text, text)              from public, anon, authenticated;
grant execute on function public.join_room(text, text)            to anon, authenticated;
grant execute on function public.heartbeat(text, text)            to anon, authenticated;
grant execute on function public.send_message(text, text, text)   to anon, authenticated;
grant execute on function public.leave_room(text, text)           to anon, authenticated;

-- =====================================================================
-- 5. 只保留最近 200 則訊息
-- =====================================================================

create or replace function public.trim_messages()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from public.messages
   where id <= (select id from public.messages order by id desc offset 200 limit 1);
  return null;
end
$$;
revoke all on function public.trim_messages() from public, anon, authenticated;

drop trigger if exists trim_messages on public.messages;
create trigger trim_messages
  after insert on public.messages
  for each statement execute function public.trim_messages();

-- =====================================================================
-- 6. 開啟即時通知（Realtime）：messages 與 members 有新增或刪除時通知所有人
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members') then
    alter publication supabase_realtime add table public.members;
  end if;
end
$$;
