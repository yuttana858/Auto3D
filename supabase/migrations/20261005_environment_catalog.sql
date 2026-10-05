insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('auto3d-hdri', 'auto3d-hdri', true, 67108864, array['application/octet-stream','image/vnd.radiance','image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.auto3d_environments (
  id text primary key,
  name text not null,
  preview_path text not null,
  render_path text,
  thumbnail_path text not null,
  source_url text,
  license text not null default 'CC0-1.0',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.auto3d_environments enable row level security;
revoke all on public.auto3d_environments from anon, authenticated;
grant select on public.auto3d_environments to anon, authenticated;

drop policy if exists "Read Auto3D environment presets" on public.auto3d_environments;
create policy "Read Auto3D environment presets"
on public.auto3d_environments for select
to anon, authenticated
using (true);

insert into public.auto3d_environments (id,name,preview_path,render_path,thumbnail_path,source_url,license,sort_order)
values
('studio_small_09','Studio Small','preview/studio_small_09.hdr',null,'thumb/studio_small_09.png','https://polyhaven.com/a/studio_small_09','CC0-1.0',10),
('colorful_studio','Colorful Studio','preview/colorful_studio.hdr',null,'thumb/colorful_studio.png','https://polyhaven.com/a/colorful_studio','CC0-1.0',20),
('blue_photo_studio','Blue Photo Studio','preview/blue_photo_studio.hdr',null,'thumb/blue_photo_studio.png','https://polyhaven.com/a/blue_photo_studio','CC0-1.0',30),
('kiara_interior','Kiara Interior','preview/kiara_interior.hdr',null,'thumb/kiara_interior.png','https://polyhaven.com/a/kiara_interior','CC0-1.0',40),
('autumn_forest_02','Autumn Forest','preview/autumn_forest_02.hdr',null,'thumb/autumn_forest_02.png','https://polyhaven.com/a/autumn_forest_02','CC0-1.0',50),
('shanghai_bund','Shanghai Bund','preview/shanghai_bund.hdr',null,'thumb/shanghai_bund.png','https://polyhaven.com/a/shanghai_bund','CC0-1.0',60),
('decor_shop','Decor Shop','preview/decor_shop.hdr',null,'thumb/decor_shop.png','https://polyhaven.com/a/decor_shop','CC0-1.0',70),
('gear_store','Gear Store','preview/gear_store.hdr',null,'thumb/gear_store.png','https://polyhaven.com/a/gear_store','CC0-1.0',80)
on conflict (id) do update set
  name=excluded.name, preview_path=excluded.preview_path, thumbnail_path=excluded.thumbnail_path,
  source_url=excluded.source_url, license=excluded.license, sort_order=excluded.sort_order, updated_at=now();
