import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LineChart, Package } from "lucide-react";
import ProductChart from "@/components/ProductChart";

interface Product {
  id: string;
  url: string;
  title: string | null;
  image_url: string | null;
  current_price: number | null;
  previous_price: number | null;
  currency: string | null;
  in_stock: boolean | null;
  last_checked_at: string | null;
  last_error: string | null;
  tags: string[] | null;
}

const Charts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setProducts(data as Product[]);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel("charts-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-5 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="size-10 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-glow)]">
            <LineChart className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Price Charts</h1>
            <p className="text-xs text-muted-foreground">Price history for all tracked products</p>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {loading ? (
          <Card className="p-12 text-center border-dashed">
            <p className="text-muted-foreground">Loading charts...</p>
          </Card>
        ) : products.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Package className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No products tracked yet.</p>
            <Link to="/">
              <Button variant="default">Go to Dashboard</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {products.map((p) => (
              <ProductChart key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Charts;