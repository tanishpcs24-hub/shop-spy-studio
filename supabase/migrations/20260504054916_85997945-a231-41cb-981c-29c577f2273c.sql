ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_products_tags ON public.products USING GIN(tags);