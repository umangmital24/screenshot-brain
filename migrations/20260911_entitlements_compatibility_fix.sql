-- Compatibility follow-up for deployments that still write legacy `tier`
-- without setting `plan_code` explicitly.

create or replace function get_user_entitlements(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active_plan as (
    select coalesce(
      (select coalesce(us.plan_code, us.tier, 'free')
       from user_subscriptions us
       where us.user_id = p_user_id
         and us.status in ('active','trialing')
       limit 1),
      'free'
    ) as plan_code
  )
  select jsonb_build_object(
    'plan_code', ap.plan_code,
    'entitlements', coalesce(jsonb_object_agg(pe.entitlement_key, pe.value_json)
      filter (where pe.entitlement_key is not null), '{}'::jsonb)
  )
  from active_plan ap
  left join plan_entitlements pe on pe.plan_code = ap.plan_code
  group by ap.plan_code;
$$;
