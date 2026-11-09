-- Supabase SQL Editor'da bir marta ishga tushiring (server ham o'zi jadval yaratadi)
create table if not exists public.users(
  id text primary key, name text, username text, photo text,
  wins int default 0, losses int default 0, games int default 0);
-- Ochiq Data API orqali o'qib bo'lmasligi uchun RLS yoqiladi.
-- Server to'g'ridan-to'g'ri Postgres'ga ulanadi (DATABASE_URL), shuning uchun u bundan ta'sirlanmaydi.
alter table public.users enable row level security;
