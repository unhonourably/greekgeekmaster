update public.notification_kinds set default_sms = false;
update public.notification_preferences set sms = false where sms is distinct from false;
update public.notifications
set sms_status = 'skipped', sms_next_attempt_at = null
where sms_status in ('pending', 'failed', 'sending');

create or replace function private.notify(
  p_user uuid,
  p_chapter uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.notification_kinds;
  v_pref public.notification_preferences;
  v_in_app boolean;
  v_email boolean;
  v_id uuid;
begin
  select * into v_kind from public.notification_kinds where kind = p_kind;
  if v_kind.kind is null then
    raise exception 'unknown notification kind %', p_kind;
  end if;
  select * into v_pref from public.notification_preferences where user_id = p_user and kind = p_kind;
  v_in_app := coalesce(v_pref.in_app, v_kind.default_in_app) or v_kind.required;
  v_email := coalesce(v_pref.email, v_kind.default_email) or (v_kind.required and v_kind.default_email);
  if not v_in_app and not v_email then
    return null;
  end if;
  insert into public.notifications (
    user_id, chapter_id, kind, title, body, link, dedupe_key,
    email_status, email_next_attempt_at,
    sms_status, sms_next_attempt_at,
    read_at
  )
  values (
    p_user, p_chapter, p_kind, left(p_title, 160), left(p_body, 500), p_link, p_dedupe,
    case when v_email then 'pending' else 'skipped' end,
    case when v_email then now() else null end,
    'skipped',
    null,
    case when v_in_app then null else now() end
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
