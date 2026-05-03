import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Product {
  id: string;
  title: string | null;
  current_price: number | null;
  currency: string | null;
  last_checked_at: string | null;
}

interface Point {
  recorded_at: string;
  price: number | null;
}

const ProductChart = ({ product }: { product: Product }) => {
  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("price_history")
        .select("recorded_at, price")
        .eq("product_id", product.id)
        .order("recorded_at", { ascending: true });
      if (active && data) setPoints(data);
    };
    load();
    const channel = supabase
      .channel(`history-${product.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_history", filter: `product_id=eq.${product.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [product.id]);

  const chartData = points.map((p) => ({
    time: new Date(p.recorded_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    }),
    price: p.price,
  }));

  const min = Math.min(...points.map((p) => p.price ?? Infinity));
  const max = Math.max(...points.map((p) => p.price ?? -Infinity));

  return (
    <Card className="p-6 bg-[image:var(--gradient-card)] border-border">
      <div className="mb-4">
        <h3 className="font-semibold truncate">{product.title}</h3>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-3xl font-bold text-primary">
            {product.currency ?? ""} {product.current_price ?? "—"}
          </span>
          {points.length > 1 && (
            <span className="text-xs text-muted-foreground">
              Low {min} · High {max}
            </span>
          )}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          No price history yet
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  color: "hsl(var(--foreground))",
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#priceFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {product.last_checked_at && (
        <p className="text-xs text-muted-foreground mt-3">
          Last checked: {new Date(product.last_checked_at).toLocaleString()}
        </p>
      )}
    </Card>
  );
};

export default ProductChart;