insert into public.admin_profiles
  (user_id, username, display_name, is_active, must_change_password)
select
  u.id,
  v.username,
  v.display_name,
  true,
  true
from auth.users u
join (values
  ('waleed-abdelmon3m', 'Waleed Abdelmon3m'),
  ('somiaa-osman', 'Somiaa Osman'),
  ('farouk-salah', 'Farouk Salah'),
  ('basmala-hendy', 'Basmala Hendy'),
  ('yousef-mohamed', 'Yousef Mohamed'),
  ('asmaa-mekky', 'Asmaa Mekky')
) as v(username, display_name)
  on lower(u.email) = v.username || '@admins.safwa.local'
on conflict (user_id) do update
set username = excluded.username,
    display_name = excluded.display_name,
    is_active = true,
    must_change_password = true;

select username, display_name, is_active, must_change_password
from public.admin_profiles
order by username;
