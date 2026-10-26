create or replace function private.guard_chore_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chapter_id is distinct from old.chapter_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'chore ownership cannot change' using errcode = '42501';
  end if;
  if private.has_permission(new.chapter_id, 'housing.manage') then
    new.completed_at := case when new.status = 'done' then coalesce(new.completed_at, now()) else null end;
    return new;
  end if;
  if new.title is distinct from old.title or new.assigned_membership_id is distinct from old.assigned_membership_id or new.due_on is distinct from old.due_on then
    raise exception 'only housing managers can change chore details' using errcode = '42501';
  end if;
  if old.status <> 'pending' or new.status not in ('pending', 'done') then
    raise exception 'this chore can no longer be updated' using errcode = '42501';
  end if;
  new.completed_at := case when new.status = 'done' then now() else null end;
  return new;
end;
$$;

create trigger chores_guard before update on public.chores
  for each row execute function private.guard_chore_update();

create or replace function private.notify_membership(p_membership uuid, p_kind text, p_title text, p_body text, p_path text, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_chapter uuid;
  v_slug text;
begin
  select m.user_id, m.chapter_id, c.slug into v_user, v_chapter, v_slug
  from public.memberships m join public.chapters c on c.id = m.chapter_id
  where m.id = p_membership and m.status = 'active';
  if v_user is null or v_user = auth.uid() then
    return;
  end if;
  perform private.notify(v_user, v_chapter, p_kind, p_title, p_body, '/c/' || v_slug || p_path, p_dedupe);
end;
$$;

revoke execute on function private.notify_membership(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function private.chore_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.assigned_membership_id is distinct from old.assigned_membership_id then
    perform private.notify_membership(new.assigned_membership_id, 'task_assigned', 'Chore assigned: ' || new.title,
      'Due ' || to_char(new.due_on, 'Mon DD, YYYY'), '/housing', 'chore:' || new.id || ':' || new.assigned_membership_id);
  end if;
  return new;
end;
$$;

create trigger chores_notify after insert or update of assigned_membership_id on public.chores
  for each row execute function private.chore_assigned();

create or replace function private.maintenance_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_membership_id is not null and new.assigned_membership_id is distinct from old.assigned_membership_id then
    perform private.notify_membership(new.assigned_membership_id, 'task_assigned', 'Maintenance assigned: ' || new.title,
      initcap(new.priority) || ' priority', '/housing', 'maintenance:' || new.id || ':' || new.assigned_membership_id);
  end if;
  return new;
end;
$$;

create trigger maintenance_notify after update of assigned_membership_id on public.maintenance_requests
  for each row execute function private.maintenance_assigned();

create or replace function private.policy_version_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.policy_documents;
  v_slug text;
  v_m record;
begin
  select * into v_doc from public.policy_documents where id = new.policy_id;
  if not v_doc.requires_ack then
    return new;
  end if;
  select slug into v_slug from public.chapters where id = new.chapter_id;
  for v_m in select user_id from public.memberships where chapter_id = new.chapter_id and status = 'active' and user_id <> new.published_by loop
    perform private.notify(v_m.user_id, new.chapter_id, 'policy_update',
      case when new.version = 1 then 'New policy: ' else 'Policy revised: ' end || v_doc.title,
      'Please read and acknowledge version ' || new.version || '.', '/c/' || v_slug || '/standards', 'policy:' || new.id);
  end loop;
  return new;
end;
$$;

create trigger policy_versions_notify after insert on public.policy_versions
  for each row execute function private.policy_version_published();

insert into public.notification_kinds (kind, label, description, default_in_app, default_email, required) values
  ('reimbursement_update', 'Reimbursements', 'Decisions and payouts on reimbursements you requested', true, true, false)
on conflict (kind) do nothing;

create or replace function private.reimbursement_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_amount text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select slug into v_slug from public.chapters where id = new.chapter_id;
  v_amount := '$' || to_char(new.amount_cents / 100.0, 'FM999,999,990.00');
  perform private.notify(new.user_id, new.chapter_id, 'reimbursement_update',
    case new.status
      when 'approved' then 'Reimbursement approved: ' || v_amount
      when 'rejected' then 'Reimbursement not approved: ' || v_amount
      when 'paid' then 'Reimbursement paid: ' || v_amount
      else 'Reimbursement updated'
    end,
    left(new.description, 200), '/c/' || v_slug || '/reimbursements', 'reimbursement:' || new.id || ':' || new.status);
  return new;
end;
$$;

create trigger reimbursement_notify after update of status on public.reimbursement_requests
  for each row execute function private.reimbursement_status_changed();
