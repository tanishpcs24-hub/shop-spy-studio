import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Activity,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Package,
  Search,
  Tag,
  X,
  ArrowUpDown,
  LineChart,
} from "lucide-react";

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

const PRESET_TAGS = ["Electronics", "Fashion", "Home", "Books", "Grocery", "Wishlist"];
type SortKey = "newest" | "price-asc" | "price-desc" | "name";

const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");

  const load = async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setProducts(data as Product[]);
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
      body: { url: trimmed, tags: newTags },
    });
    setAdding(false);
    if (error || !data?.success) {
      toast.error("Failed to track product", { description: data?.error ?? error?.message });
      return;
    }
    // Persist tags client-side too in case the edge function ignored them
    if (newTags.length && data?.productId) {
      await supabase.from("products").update({ tags: newTags }).eq("id", data.productId);
    }
    toast.success("Product added to tracker");
    setUrl("");
    setNewTags([]);
    setTagInput("");
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

  const toggleNewTag = (tag: string) => {
    setNewTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const addCustomTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!newTags.includes(t)) setNewTags([...newTags, t]);
    setTagInput("");
  };

  const toggleFilter = (tag: string) => {
    setActiveFilters((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const updateProductTags = async (id: string, tags: string[]) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, tags } : p)));
    await supabase.from("products").update({ tags }).eq("id", id);
  };

  const removeTagFromProduct = async (id: string, tag: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    await updateProductTags(id, (p.tags ?? []).filter((t) => t !== tag));
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => (p.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => {
      const matchSearch =
        !search ||
        (p.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
        p.url.toLowerCase().includes(search.toLowerCase());
      const matchTags =
        activeFilters.length === 0 ||
        activeFilters.every((t) => (p.tags ?? []).includes(t));
      return matchSearch && matchTags;
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return (a.current_price ?? Infinity) - (b.current_price ?? Infinity);
        case "price-desc":
          return (b.current_price ?? -Infinity) - (a.current_price ?? -Infinity);
        case "name":
          return (a.title ?? "").localeCompare(b.title ?? "");
        default:
          return 0;
      }
    });
    return sorted;
  }, [products, search, activeFilters, sort]);

  const stats = useMemo(() => {
    const total = products.length;
    const inStock = products.filter((p) => p.in_stock).length;
    const drops = products.filter(
      (p) => p.previous_price != null && p.current_price != null && p.current_price < p.previous_price
    ).length;
    const tracked = allTags.length;
    return { total, inStock, drops, tracked };
  }, [products, allTags]);

  const sortLabels: Record<SortKey, string> = {
    newest: "Newest",
    "price-asc": "Price ↑",
    "price-desc": "Price ↓",
    name: "Name",
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-5 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Activity className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">PriceWatch</h1>
            <p className="text-xs text-muted-foreground">Track e-commerce prices in real time</p>
          </div>
          <Link to="/charts">
            <Button variant="secondary" className="gap-2">
              <LineChart className="size-4" /> View Charts
            </Button>
          </Link>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Tracked", value: stats.total, icon: Package },
            { label: "In stock", value: stats.inStock, icon: Activity },
            { label: "Price drops", value: stats.drops, icon: TrendingDown },
            { label: "Tags", value: stats.tracked, icon: Tag },
          ].map((s) => (
            <Card
              key={s.label}
              className="p-4 bg-[image:var(--gradient-card)] border-border hover:border-primary/40 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className="size-5 text-primary" />
              </div>
            </Card>
          ))}
        </section>

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
          <div className="mt-4 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Tag className="size-3" /> Tags for this product
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((t) => {
                const active = newTags.includes(t);
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleNewTag(t)}
                    className={`px-3 py-1 rounded-full text-xs border transition-all ${
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-glow)]"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
              {newTags
                .filter((t) => !PRESET_TAGS.includes(t))
                .map((t) => (
                  <span
                    key={t}
                    className="px-3 py-1 rounded-full text-xs bg-accent/20 border border-accent/40 text-accent flex items-center gap-1"
                  >
                    {t}
                    <button type="button" onClick={() => toggleNewTag(t)}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a custom tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={addCustomTag}>
                Add tag
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-[image:var(--gradient-card)] border-border">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative flex-1">
              <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={sort === k ? "default" : "ghost"}
                  onClick={() => setSort(k)}
                  className="gap-1"
                >
                  {sort === k && <ArrowUpDown className="size-3" />}
                  {sortLabels[k]}
                </Button>
              ))}
            </div>
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground self-center">Filter by tag:</span>
              {allTags.map((t) => {
                const active = activeFilters.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleFilter(t)}
                    className={`px-3 py-1 rounded-full text-xs border transition-all ${
                      active
                        ? "bg-accent text-accent-foreground border-accent"
                        : "border-border text-muted-foreground hover:border-accent/60"
                    }`}
                  >
                    #{t}
                  </button>
                );
              })}
              {activeFilters.length > 0 && (
                <button
                  onClick={() => setActiveFilters([])}
                  className="px-3 py-1 rounded-full text-xs text-destructive hover:bg-destructive/10"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Tracked Products ({filteredProducts.length}/{products.length})
            </h2>
            <Link to="/charts" className="text-xs text-primary hover:underline flex items-center gap-1">
              <LineChart className="size-3" /> View all price charts
            </Link>
          </div>
          {filteredProducts.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Package className="size-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {products.length === 0
                    ? "No products tracked yet. Add one above to start."
                    : "No products match your filters."}
                </p>
              </Card>
            ) : (
              filteredProducts.map((p) => {
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
                    className={`p-4 cursor-pointer transition-all hover:border-primary/50 hover:-translate-y-0.5 ${
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
                        {(p.tags?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {p.tags!.map((t) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 group"
                              >
                                #{t}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeTagFromProduct(p.id, t);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="size-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
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
      </main>
    </div>
  );
};

export default Dashboard;