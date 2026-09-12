alter table public.memories
  add column if not exists visual_context text;

comment on column public.memories.visual_context is
  'Privacy-preserving on-device visual labels/colors used for semantic memory search; raw image pixels are not required.';
