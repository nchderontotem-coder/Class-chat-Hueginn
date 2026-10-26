create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid()
        references auth.users(id) on delete cascade,
    content text not null
        check (char_length(trim(content)) between 1 and 500),
    created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

grant select on public.messages to authenticated;

drop policy if exists "Users can read messages"
on public.messages;

create policy "Users can read messages"
on public.messages
for select
to authenticated
using (true);
grant insert on public.messages to authenticated;

drop policy if exists "Users can send their own messages"
on public.messages;

create policy "Users can send their own messages"
on public.messages
for insert
to authenticated
with check ((select auth.uid()) = user_id);

alter publication supabase_realtime
add table public.messages;
create or replace function check_message_limit()
returns trigger
language plpgsql
as $$
begin
    if (
        select count(*)
        from messages
        where user_id = auth.uid()
        and created_at > now() - interval '1 minute'
    ) >= 5 then
        raise exception 'Too many messages. Wait a minute.';
    end if;

    return new;
end;
$$;

create trigger message_limit
before insert on messages
for each row
execute function check_message_limit();

create policy "Users can delete their own messages"
on public.messages
for delete
to authenticated
using ((select auth.uid()) = user_id);
create or replace function check_message_limit()
returns trigger
language plpgsql
as $$
begin
    if (
        select count(*)
        from public.messages
        where user_id = auth.uid()
        and created_at > now() - interval '1 minute'
    ) >= 5 then
        raise exception 'You can only send 5 messages per minute.';
    end if;

    return new;
end;
$$;

drop trigger if exists message_limit_trigger
on public.messages;

create trigger message_limit_trigger
before insert on public.messages
for each row
execute function check_message_limit();