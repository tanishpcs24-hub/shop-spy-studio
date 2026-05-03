import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";

interface ScrapeResult {
  title?: string;
  price?: number;
  currency?: string;
  in_stock?: boolean;
  image_url?: string;
}

async function scrapeWithFirecrawl(url: string): Promise<ScrapeResult> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "Product title/name" },
      price: { type: "number", description: "Current numeric price (no currency symbol)" },
      currency: { type: "string", description: "Currency code or symbol e.g. USD, INR, $, ₹" },
      in_stock: { type: "boolean", description: "Whether the product is available/in stock" },
      image_url: { type: "string", description: "Main product image URL" },
    },
    required: ["price"],
  };

  const res = await fetch(FIRECRAWL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      formats: [
        {
          type: "json",
          schema,
          prompt: "Extract product information from this e-commerce page.",
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Firecrawl ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }

  const json = data?.data?.json ?? data?.json ?? {};
  return {
    title: json.title,
    price: typeof json.price === "number" ? json.price : parseFloat(String(json.price ?? "").replace(/[^0-9.]/g, "")) || undefined,
    currency: json.currency,
    in_stock: json.in_stock ?? true,
    image_url: json.image_url,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    let productIds: string[] = [];
    let singleUrl: string | undefined;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.url) singleUrl = String(body.url);
      if (body.productId) productIds = [String(body.productId)];
    }

    // New product (add by URL)
    if (singleUrl) {
      const scraped = await scrapeWithFirecrawl(singleUrl);
      const { data: existing } = await supabase.from("products").select("*").eq("url", singleUrl).maybeSingle();

      if (existing) {
        await supabase.from("products").update({
          title: scraped.title ?? existing.title,
          image_url: scraped.image_url ?? existing.image_url,
          previous_price: existing.current_price,
          current_price: scraped.price ?? existing.current_price,
          currency: scraped.currency ?? existing.currency,
          in_stock: scraped.in_stock ?? existing.in_stock,
          last_checked_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", existing.id);
        await supabase.from("price_history").insert({
          product_id: existing.id, price: scraped.price, in_stock: scraped.in_stock,
        });
        return new Response(JSON.stringify({ success: true, id: existing.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: created, error } = await supabase.from("products").insert({
        url: singleUrl,
        title: scraped.title ?? singleUrl,
        image_url: scraped.image_url,
        current_price: scraped.price,
        currency: scraped.currency ?? "USD",
        in_stock: scraped.in_stock ?? true,
        last_checked_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      await supabase.from("price_history").insert({
        product_id: created.id, price: scraped.price, in_stock: scraped.in_stock,
      });
      return new Response(JSON.stringify({ success: true, product: created }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Otherwise: refresh all (cron) or specific
    let products;
    if (productIds.length) {
      const { data } = await supabase.from("products").select("*").in("id", productIds);
      products = data ?? [];
    } else {
      const { data } = await supabase.from("products").select("*");
      products = data ?? [];
    }

    const results = [];
    for (const p of products) {
      try {
        const scraped = await scrapeWithFirecrawl(p.url);
        await supabase.from("products").update({
          previous_price: p.current_price,
          current_price: scraped.price ?? p.current_price,
          in_stock: scraped.in_stock ?? p.in_stock,
          title: scraped.title ?? p.title,
          image_url: scraped.image_url ?? p.image_url,
          last_checked_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", p.id);
        await supabase.from("price_history").insert({
          product_id: p.id, price: scraped.price, in_stock: scraped.in_stock,
        });
        results.push({ id: p.id, ok: true, price: scraped.price });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.from("products").update({
          last_checked_at: new Date().toISOString(),
          last_error: msg.slice(0, 500),
        }).eq("id", p.id);
        results.push({ id: p.id, ok: false, error: msg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});