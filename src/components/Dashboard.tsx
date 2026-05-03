import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, Package } from "lucide-react";
import ProductChart from "./ProductChart";

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
}

const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setProducts(data);
      if (!selected && data.length) setSelected(data[0].id);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("products-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify on price drops
  useEffect(() => {
    products.forEach((p) => {
      if (
        p.previous_price != null &&
        p.current_price != null &&
        p.current_price < p.previous_price
      ) {
        const key = `notified-${p.id}-${p.current_price}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          toast.success(`Price drop on ${p.title?.slice(0, 40) ?? "product"}!`, {
            description: `${p.previous_price} → ${p.current_price} ${p.currency ?? ""}`,
          });
        }
      }
    });
  }, [products]);

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("scrape-product", {
      body: { url: trimmed },
    });
    setAdding(false);
    if (error || !data?.success) {
      toast.error("Failed to track product", { description: data?.error ?? error?.message });
      return;
    }
    toast.success("Product added to tracker");
    setUrl("");
    load();
  };

  const refresh = async (id: string) => {
    setRefreshing(id);
    const { data, error } = await supabase.functions.invoke("scrape-product", {
      body: { productId: id },
    });
    setRefreshing(null);
    if (error || !data?.success) {
      toast.error("Refresh failed", { description: data?.error ?? error?.message });
      return;
    }
    toast.success("Refreshed");
  };

  const remove = async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    if (selected === id) setSelected(null);
    toast.success("Removed");
  };

  const selectedProduct = products.find((p) => p.id === selected);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-5 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Activity className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">PriceWatch</h1>
            <p className="text-xs text-muted-foreground">Track e-commerce prices in real time</p>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <Card className="p-6 bg-[image:var(--gradient-card)] border-border">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="size-4 text-primary" /> Add a product to track
          </h2>
          <form onSubmit={addProduct} className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Paste Amazon, Flipkart or any product URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={adding} variant="default">
              {adding ? <RefreshCw className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {adding ? "Tracking..." : "Track Product"}
            </Button>
          </form>
        </Card>

        <div className="grid lg:grid-cols-[1fr,1.2fr] gap-6">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Tracked Products ({products.length})
            </h2>
            {products.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Package className="size-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No products tracked yet. Add one above to start.</p>
              </Card>
            ) : (
              products.map((p) => {
                const dropped =
                  p.previous_price != null &&
                  p.current_price != null &&
                  p.current_price < p.previous_price;
                const rose =
                  p.previous_price != null &&
                  p.current_price != null &&
                  p.current_price > p.previous_price;
                return (
                  <Card
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={`p-4 cursor-pointer transition-all hover:border-primary/50 ${
                      selected === p.id ? "border-primary shadow-[var(--shadow-glow)]" : ""
                    }`}
                  >
                    <div className="flex gap-4">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.title ?? "product"}
                          className="size-16 rounded-lg object-cover bg-muted shrink-0"
                        />
                      ) : (
                        <div className="size-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Package className="size-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.title ?? p.url}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-lg font-semibold">
                            {p.currency ?? ""} {p.current_price ?? "—"}
                          </span>
                          {dropped && (
                            <Badge className="bg-success/15 text-success border-success/30 gap-1">
                              <TrendingDown className="size-3" />
                              {p.previous_price}
                            </Badge>
                          )}
                          {rose && (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1">
                              <TrendingUp className="size-3" />
                              {p.previous_price}
                            </Badge>
                          )}
                          <Badge variant={p.in_stock ? "secondary" : "destructive"}>
                            {p.in_stock ? "In stock" : "Out of stock"}
                          </Badge>
                        </div>
                        {p.last_error && (
                          <p className="text-xs text-destructive mt-1 truncate">{p.last_error}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            refresh(p.id);
                          }}
                          disabled={refreshing === p.id}
                        >
                          <RefreshCw
                            className={`size-4 ${refreshing === p.id ? "animate-spin" : ""}`}
                          />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(p.id);
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Price History
            </h2>
            {selectedProduct ? (
              <ProductChart product={selectedProduct} />
            ) : (
              <Card className="p-12 text-center border-dashed h-full flex items-center justify-center">
                <p className="text-muted-foreground">Select a product to see its price history</p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;