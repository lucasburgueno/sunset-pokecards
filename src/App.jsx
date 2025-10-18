import React, { useEffect, useMemo, useState, useContext, createContext, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
  Navigate,
} from "react-router-dom";

/** ====== CONFIG ====== */
const API_BASE = "https://66a29184967c89168f208462.mockapi.io"; // tu MockAPI
const PAGE_SIZE = 20;
const WHATSAPP_NUMBER = "5491121829819";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY || "";

// Cloudinary (unsigned upload)
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD || "";
const CLOUD_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET || "";

/** ====== UTILS ====== */
const prettyCategory = (c) => {
  if (!c) return "Otros";
  const lc = String(c).toLowerCase();
  if (lc === "boosterbox") return "Booster Box";
  if (lc === "boosterpack") return "Booster Pack";
  if (lc === "singles" || lc === "single") return "Singles";
  return c.charAt(0).toUpperCase() + c.slice(1);
};

function currency(n, code = "ARS") {
  try {
    return Number(n).toLocaleString("es-AR", { style: "currency", currency: code || "ARS" });
  } catch {
    return `${code} ${n}`;
  }
}

/** Productos: guardamos USD en backend (precio_usd). Front convierte a ARS con rate. */
function mapApiItem(it) {
  const priceUsd =
    Number(String(it.precio_usd ?? it.price_usd ?? it.precio ?? it.price ?? 0).replace(/[^\d.-]/g, "")) || 0;

  return {
    id: String(it.id),
    name: it.nombre || it.name || "Producto sin nombre",
    priceUSD: priceUsd,
    image: it.imagen || it.image || "https://via.placeholder.com/600x600?text=POKEMON",
    category: prettyCategory(it.categoria || it.category),
    description: it.descripcion || it.description || "Descripción pendiente.",
    stock: Number(it.stock ?? 99),
    currencyCode: "USD",
  };
}

function buildWspLink(product) {
  const text = encodeURIComponent(
    `Hola! Quiero consultar por *${product.name}* (ID ${product.id}). ¿Está disponible?`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

async function fetchAll() {
  const res = await fetch(`${API_BASE}/productos`);
  const raw = await res.json();
  return (Array.isArray(raw) ? raw : []).map(mapApiItem);
}

/** ====== RATE HOOK ====== */
function useUsdArsRate(type = "blue") {
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancel = false;
    async function run() {
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${API_URL}/usd-ars?type=${encodeURIComponent(type)}`);
        const j = await r.json();
        if (!r.ok || !j.rate) throw new Error(j?.error || "rate_error");
        if (!cancel) setRate(Number(j.rate));
      } catch (e) {
        console.error("rate_load_error", e);
        if (!cancel) setErr("No se pudo obtener la cotización");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    run();
    const id = setInterval(run, 10 * 60 * 1000);
    return () => { cancel = true; clearInterval(id); };
  }, [type]);

  return { rate, loading, err };
}

/** ====== CART (Context + localStorage) ====== */
const CartContext = createContext(null);
function useCart() { return useContext(CartContext); }

function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cart_v2_usd") || "[]"); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem("cart_v2_usd", JSON.stringify(items)); }, [items]);

  const totalQty = useMemo(() => items.reduce((acc, it) => acc + it.qty, 0), [items]);
  const totalUSD = useMemo(() => items.reduce((a, it) => a + (it.priceUSD * it.qty), 0), [items]);

  function addItem(product, qty = 1) {
    setItems(prev => {
      const i = prev.findIndex(p => p.id === product.id);
      if (i >= 0) {
        const clone = [...prev];
        clone[i] = { ...clone[i], qty: Math.min((clone[i].qty || 1) + qty, product.stock || 999) };
        return clone;
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        priceUSD: product.priceUSD,
        image: product.image,
        qty: Math.min(qty, product.stock || 999),
        stock: product.stock || 999,
      }];
    });
  }
  const removeItem = id => setItems(prev => prev.filter(p => p.id !== id));
  const setQty = (id, qty) => setItems(prev => prev.map(p => p.id === id ? { ...p, qty: Math.max(1, Math.min(qty, p.stock || 999)) } : p));
  const clear = () => setItems([]);

  const value = { items, totalQty, totalUSD, addItem, removeItem, setQty, clear };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** ====== LAYOUT ====== */
function Nav() {
  const [open, setOpen] = useState(false);
  const { totalQty } = useCart();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold tracking-wide text-xl">Sunset TCG</Link>
        <nav className="hidden md:flex gap-6 text-sm">
          <Link className={`hover:opacity-70 ${location.pathname.startsWith("/productos") ? "font-medium" : ""}`} to="/productos">Productos</Link>
          <Link className={`hover:opacity-70 ${location.pathname.startsWith("/contacto") ? "font-medium" : ""}`} to="/contacto">Contacto</Link>
          <Link className={`hover:opacity-70 ${location.pathname.startsWith("/carrito") ? "font-medium" : ""}`} to="/carrito">
            Carrito <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 text-[11px] px-1 rounded-full bg-black text-white">{totalQty}</span>
          </Link>
          {/* apunto a /admin/login para forzar pantalla de login si no está logueado */}
          <Link className={`hover:opacity-70 ${location.pathname.startsWith("/admin") ? "font-medium" : ""}`} to="/admin/login">Admin</Link>
        </nav>
        <div className="md:hidden flex items-center gap-2">
          <Link to="/carrito" className="border rounded-xl px-3 py-2 text-sm">Carrito ({totalQty})</Link>
          <button className="border rounded-xl px-3 py-2 text-sm" onClick={() => setOpen(v => !v)}>Menú</button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t">
          <div className="px-4 py-3 flex flex-col gap-3 text-sm">
            <Link to="/productos" onClick={() => setOpen(false)}>Productos</Link>
            <Link to="/contacto" onClick={() => setOpen(false)}>Contacto</Link>
            <Link to="/carrito" onClick={() => setOpen(false)}>Carrito</Link>
            <Link to="/admin/login" onClick={() => setOpen(false)}>Admin</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t text-center py-6 text-sm text-neutral-500">
      © {new Date().getFullYear()} Sunset TCG — Envíos a todo el país
    </footer>
  );
}

/** ====== HOME ====== */
function Home() {
  const navigate = useNavigate();
  return (
    <main className="max-w-6xl mx-auto px-4 py-10 text-center">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Cartas Pokémon y accesorios</h1>
      <p className="mt-3 text-neutral-600">Precios base en USD. Mostramos y cobramos en ARS según cotización actual.</p>
      <button onClick={() => navigate("/productos")} className="mt-6 rounded-2xl shadow px-5 py-3 bg-black text-white text-sm">Ver productos</button>
    </main>
  );
}

/** ====== LISTADO ====== */
function Products() {
  const [sp] = useSearchParams();
  const pageParam = Number(sp.get("page") || 1);
  const [page, setPage] = useState(pageParam);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("featured");

  const { addItem } = useCart();
  const { rate, loading: rateLoading, err: rateErr } = useUsdArsRate("blue");

  useEffect(() => {
    setLoading(true);
    fetchAll()
      .then((all) => {
        setCategories(Array.from(new Set(all.map((p) => p.category))).filter(Boolean));

        let filtered = all;
        if (cat) filtered = filtered.filter((p) => p.category === cat);
        if (q)  filtered = filtered.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()));

        const conv = (p) => rate ? p.priceUSD * rate : p.priceUSD;
        switch (sort) {
          case "price_asc":  filtered.sort((a,b)=>conv(a)-conv(b)); break;
          case "price_desc": filtered.sort((a,b)=>conv(b)-conv(a)); break;
          case "name_asc":   filtered.sort((a,b)=>a.name.localeCompare(b.name)); break;
          case "name_desc":  filtered.sort((a,b)=>b.name.localeCompare(a.name)); break;
          default: break;
        }

        const start = (page - 1) * PAGE_SIZE;
        setTotal(filtered.length);
        setItems(filtered.slice(start, start + PAGE_SIZE));
      })
      .finally(() => setLoading(false));
  }, [page, q, cat, sort, rate]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-2 text-xs text-neutral-500">
        {rateLoading ? "Actualizando cotización..." : rateErr ? "Sin cotización. Mostrando USD." : `Cotización blue: ${currency(rate, "ARS")} por USD`}
      </div>

      <div className="mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <div className="flex gap-2">
          <input value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} placeholder="Buscar…" className="border rounded-xl px-3 py-2 text-sm w-56"/>
          <select value={sort} onChange={(e)=>{ setPage(1); setSort(e.target.value); }} className="border rounded-xl px-3 py-2 text-sm">
            <option value="featured">Destacados</option>
            <option value="price_asc">Precio: menor a mayor</option>
            <option value="price_desc">Precio: mayor a menor</option>
            <option value="name_asc">Nombre: A → Z</option>
            <option value="name_desc">Nombre: Z → A</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="border rounded-2xl p-4 h-fit sticky top-24">
          <div className="font-medium mb-2">Categorías</div>
          <ul className="space-y-2 text-sm">
            <li><button className={`hover:underline ${!cat ? "font-semibold" : ""}`} onClick={()=>{ setPage(1); setCat(""); }}>Todas</button></li>
            {categories.map(c=>(
              <li key={c}><button className={`hover:underline ${cat===c?"font-semibold":""}`} onClick={()=>{ setPage(1); setCat(c); }}>{c}</button></li>
            ))}
          </ul>
        </aside>

        <section>
          {loading && <div className="py-10 text-center">Cargando…</div>}
          {!loading && items.length === 0 && <div className="py-10 text-center text-neutral-500">No se encontraron productos.</div>}
          {!loading && items.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {items.map(p=>(
                  <article key={p.id} className="group border rounded-2xl overflow-hidden hover:shadow flex flex-col">
                    <Link to={`/producto/${p.id}`} className="block">
                      <div className="aspect-square bg-neutral-100 overflow-hidden">
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition"/>
                      </div>
                    </Link>
                    <div className="p-3 flex-1 flex flex-col">
                      <div className="text-sm text-neutral-500">{p.category}</div>
                      <Link to={`/producto/${p.id}`} className="font-medium leading-tight hover:underline">{p.name}</Link>
                      <div className="mt-1 text-sm">
                        {rate ? (
                          <>
                            {currency(p.priceUSD * rate, "ARS")} <span className="text-neutral-500">({currency(p.priceUSD, "USD")})</span>
                          </>
                        ) : (
                          <>{currency(p.priceUSD, "USD")}</>
                        )}
                      </div>
                      <button onClick={()=>addItem(p,1)} className="mt-3 rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">Agregar al carrito</button>
                    </div>
                  </article>
                ))}
              </div>
              <Pagination page={page} pages={pages} onPage={setPage}/>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const arr = Array.from({length: pages}, (_,i)=>i+1).slice(0,8);
  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button disabled={page<=1} onClick={()=>onPage(page-1)} className="px-3 py-2 border rounded-xl text-sm disabled:opacity-40">Anterior</button>
      {arr.map(n=>(
        <button key={n} onClick={()=>onPage(n)} className={`px-3 py-2 border rounded-xl text-sm ${n===page?"bg-black text-white":""}`}>{n}</button>
      ))}
      <button disabled={page>=pages} onClick={()=>onPage(page+1)} className="px-3 py-2 border rounded-xl text-sm disabled:opacity-40">Siguiente</button>
    </div>
  );
}

/** ====== DETALLE ====== */
function ProductDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const { rate, loading: rateLoading } = useUsdArsRate("blue");

  useEffect(() => {
    fetch(`${API_BASE}/productos/${id}`).then(r=>r.json()).then(it=>setP(mapApiItem(it))).finally(()=>setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-20">Cargando…</div>;
  if (!p) return <div className="text-center py-20">Producto no encontrado</div>;

  const priceARS = rate ? p.priceUSD * rate : null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8">
      <div className="aspect-square rounded-3xl overflow-hidden bg-neutral-100">
        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
      </div>
      <div>
        <div className="text-sm text-neutral-500">{p.category}</div>
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <div className="mt-3 text-xl font-semibold">
          {rateLoading ? "Actualizando cotización..." : priceARS ? (
            <>
              {currency(priceARS, "ARS")} <span className="text-neutral-500 text-sm">({currency(p.priceUSD, "USD")})</span>
            </>
          ) : currency(p.priceUSD, "USD")}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={()=>addItem(p,1)} className="rounded-2xl px-5 py-3 bg-black text-white text-sm">Agregar al carrito</button>
          <a href={buildWspLink(p)} target="_blank" className="rounded-2xl px-5 py-3 border text-sm text-center">Consultar por WhatsApp</a>
        </div>
      </div>
    </main>
  );
}

/** ====== CARRITO + CHECKOUT PRO EN MODAL ====== */
function CartPage() {
  const { items, totalUSD, setQty, removeItem, clear } = useCart();
  const location = useLocation();
  const status = new URLSearchParams(location.search).get('status');

  const { rate, loading: rateLoading, err: rateErr } = useUsdArsRate("blue");

  const walletRef = useRef(null);
  const [creatingPref, setCreatingPref] = useState(false);
  const [brick, setBrick] = useState(null);

  async function openMpModal() {
    if (!items.length) return;
    if (!rate) {
      alert("Esperá a que cargue la cotización para pagar.");
      return;
    }

    try {
      setCreatingPref(true);

      const mpItems = items.map(it => ({
        title: it.name,
        quantity: it.qty,
        unit_price: Math.round((it.priceUSD * rate) * 100) / 100,
        currency_id: "ARS",
        picture_url: it.image,
      }));

      const resp = await fetch(`${API_URL}/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: mpItems,
          metadata: {
            origin: 'sunset-tcg',
            rate,
            cart_usd: items.map(i => ({ id: i.id, qty: i.qty, priceUSD: i.priceUSD })),
          },
          back_urls: {
            success: window.location.origin + '/carrito?status=success',
            failure: window.location.origin + '/carrito?status=failure',
            pending: window.location.origin + '/carrito?status=pending',
          }
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        console.error('MP error', data);
        alert('No se pudo iniciar el pago.');
        return;
      }

      if (!window.MercadoPago) {
        alert('SDK de Mercado Pago no cargó. Verificá el script en index.html');
        return;
      }
      if (!MP_PUBLIC_KEY) {
        alert('Falta VITE_MP_PUBLIC_KEY en .env.local');
        return;
      }

      if (brick?.unmount) {
        await brick.unmount();
        setBrick(null);
      }
      if (walletRef.current) walletRef.current.innerHTML = '';

      const mp = new window.MercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' });
      const bricksBuilder = mp.bricks();

      const created = await bricksBuilder.create('wallet', 'wallet_container', {
        initialization: {
          preferenceId: data.id,
          redirectMode: 'modal',
        },
        customization: {
          texts: { valueProp: 'smart_option' },
          visual: { buttonBackground: 'default' },
        },
      });

      setBrick(created);
      setTimeout(() => {
        const btn = walletRef.current?.querySelector('button');
        if (btn) btn.click();
      }, 120);
    } finally {
      setCreatingPref(false);
    }
  }

  if (status === 'success') {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10 text-center">
        <h1 className="text-2xl font-semibold mb-4">¡Pago aprobado! ✅</h1>
        <p className="text-neutral-600">Gracias por tu compra. Te vamos a contactar por WhatsApp para coordinar el envío.</p>
        <div className="mt-6">
          <Link to="/productos" className="rounded-xl border px-4 py-2 text-sm">Seguir comprando</Link>
        </div>
      </main>
    );
  }

  if (!items.length) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10 text-center">
        <h1 className="text-2xl font-semibold mb-4">Carrito</h1>
        <p className="text-neutral-600 mb-6">Tu carrito está vacío.</p>
        <Link className="inline-block rounded-xl border px-4 py-2 text-sm" to="/productos">Ir al catálogo</Link>
      </main>
    );
  }

  const totalARS = rate ? items.reduce((a,it)=>a + it.priceUSD * rate * it.qty, 0) : null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Carrito</h1>
        <button onClick={clear} className="text-sm text-red-600 underline">Vaciar carrito</button>
      </div>
      <div className="text-xs text-neutral-500 mb-6">
        {rateLoading ? "Actualizando cotización..." : rateErr ? "Sin cotización (se muestra USD)" : `Cotización blue: ${currency(rate, "ARS")} por USD`}
      </div>

      <div className="grid md:grid-cols-[1fr_360px] gap-8">
        <section className="space-y-4">
          {items.map((it) => {
            const subARS = rate ? it.priceUSD * rate * it.qty : null;
            return (
              <article key={it.id} className="flex gap-4 border rounded-2xl p-3">
                <img src={it.image} alt={it.name} className="w-24 h-24 rounded-xl object-cover" />
                <div className="flex-1">
                  <div className="font-medium">{it.name}</div>
                  <div className="text-sm text-neutral-500">
                    {currency(it.priceUSD, "USD")} {rate && <>· {currency(it.priceUSD * rate, "ARS")} c/u</>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm">Cantidad:</span>
                    <input type="number" min={1} max={it.stock || 999} value={it.qty}
                          onChange={(e)=>setQty(it.id, Number(e.target.value))}
                          className="w-16 border rounded-lg px-2 py-1 text-sm" />
                    <button onClick={()=>removeItem(it.id)} className="text-sm text-red-600 underline">Quitar</button>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm">Subtotal</div>
                  <div className="font-medium">
                    {rate ? currency(subARS, "ARS") : currency(it.priceUSD * it.qty, "USD")}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="border rounded-2xl p-4 h-fit sticky top-24">
          <div className="font-medium mb-2">Resumen</div>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center justify-between">
              <span>Total (USD)</span>
              <span className="font-medium">{currency(totalUSD, "USD")}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Total (ARS)</span>
              <span className="font-medium">{rate ? currency(totalARS, "ARS") : "—"}</span>
            </li>
          </ul>

          <button
            onClick={openMpModal}
            disabled={creatingPref || !rate}
            className="mt-4 w-full text-center rounded-xl bg-[#00A650] text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {creatingPref ? 'Preparando pago…' : (rate ? 'Pagar con Mercado Pago (modal)' : 'Esperando cotización…')}
          </button>

          <div id="wallet_container" ref={walletRef} className="mt-3"></div>

          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hola! Quiero finalizar compra. Adjunto mi carrito.")}`}
            target="_blank"
            className="mt-3 block w-full text-center rounded-xl border px-4 py-2 text-sm">
            Avanzar por WhatsApp
          </a>
        </aside>
      </div>
    </main>
  );
}

/** ====== CONTACTO ====== */
function Contact() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 text-sm">
      <h1 className="text-2xl font-semibold mb-4">Contacto</h1>
      <ul className="mt-4 space-y-2">
        <li>WhatsApp: <a className="underline" href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank">+{WHATSAPP_NUMBER}</a></li>
        <li>Instagram: <a className="underline" href="https://instagram.com/sunset.tcg" target="_blank">@sunset.tcg</a></li>
        <li>Email: <a className="underline" href="mailto:hola@sunset.tcg">hola@sunset.tcg</a></li>
      </ul>
    </main>
  );
}

/** ====== ADMIN (login simple + CRUD + UPLOAD + EDIT) ====== */
function useAdminAuth() {
  const [ok, setOk] = useState(() => localStorage.getItem("admin_ok") === "1");
  const login = (u, p) => {
    if (u === "admin" && p === "admin") {
      localStorage.setItem("admin_ok", "1");
      setOk(true);
      return true;
    }
    return false;
  };
  const logout = () => { localStorage.removeItem("admin_ok"); setOk(false); };
  return { ok, login, logout };
}

// Subida a Cloudinary (unsigned). Devuelve URL segura o lanza error.
async function uploadImageToCloudinary(file) {
  if (!CLOUD_NAME || !CLOUD_PRESET) {
    throw new Error("Cloudinary no configurado. Definí VITE_CLOUDINARY_CLOUD y VITE_CLOUDINARY_PRESET.");
  }
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUD_PRESET);
  const r = await fetch(url, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "No se pudo subir la imagen");
  return j.secure_url || j.url;
}

function AdminLogin() {
  const { ok, login } = useAdminAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [e, setE] = useState("");

  if (ok) return <Navigate to="/admin" replace />;

  return (
    <main className="max-w-sm mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-4">Admin</h1>
      <form className="space-y-3" onSubmit={(ev)=>{ev.preventDefault(); setE(""); if(!login(u,p)) setE("Usuario o contraseña inválidos");}}>
        <input className="w-full border rounded-xl px-3 py-2" placeholder="Usuario" value={u} onChange={e=>setU(e.target.value)} />
        <input className="w-full border rounded-xl px-3 py-2" placeholder="Contraseña" type="password" value={p} onChange={e=>setP(e.target.value)} />
        {e && <div className="text-sm text-red-600">{e}</div>}
        <button className="w-full rounded-2xl px-5 py-3 bg-black text-white">Ingresar</button>
      </form>
      <p className="mt-4 text-xs text-neutral-500">Demo: usuario <b>admin</b>, pass <b>admin</b>. (No usar en producción)</p>
    </main>
  );
}

function AdminPage() {
  const { ok, logout } = useAdminAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  // Form de creación
  const [form, setForm] = useState({
    nombre: "",
    precio_usd: "",
    categoria: "Singles",
    imagen: "",
    descripcion: "",
    stock: 10,
    file: null, // file local para upload
  });

  // Edición
  const [editing, setEditing] = useState(null); // objeto del producto en edición
  const [editSaving, setEditSaving] = useState(false);
  const [editImgUploading, setEditImgUploading] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "",
    nombre: "",
    precio_usd: "",
    categoria: "Singles",
    imagen: "",
    descripcion: "",
    stock: 10,
    file: null,
  });

  const { rate, loading: rateLoading } = useUsdArsRate("blue");

  useEffect(() => {
    if (!ok) return;
    setLoading(true);
    fetch(`${API_BASE}/productos`)
      .then(r=>r.json())
      .then(data=>setItems(Array.isArray(data)?data:[]))
      .finally(()=>setLoading(false));
  }, [ok]);

  if (!ok) return <Navigate to="/admin/login" replace />;

  async function createProduct() {
    try {
      setSaving(true);

      let imageUrl = form.imagen || "";
      if (!imageUrl && form.file) {
        try {
          setImgUploading(true);
          imageUrl = await uploadImageToCloudinary(form.file);
        } finally {
          setImgUploading(false);
        }
      }

      const body = {
        nombre: form.nombre.trim(),
        precio_usd: Number(String(form.precio_usd).replace(/[^\d.-]/g,"")) || 0,
        categoria: form.categoria,
        imagen: imageUrl || undefined,
        descripcion: form.descripcion || "",
        stock: Number(form.stock || 0),
        moneda: "USD",
      };
      if (!body.nombre || body.precio_usd <= 0) {
        alert("Completá nombre y precio USD (>0).");
        return;
      }
      const resp = await fetch(`${API_BASE}/productos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const created = await resp.json();
      if (!resp.ok) {
        console.error(created);
        alert("No se pudo crear el producto.");
        return;
      }
      setItems(prev => [created, ...prev]);
      setForm({ nombre:"", precio_usd:"", categoria:"Singles", imagen:"", descripcion:"", stock:10, file:null });
      alert("Producto creado ✅");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id) {
    if (!confirm("¿Eliminar producto?")) return;
    const resp = await fetch(`${API_BASE}/productos/${id}`, { method: "DELETE" });
    if (resp.ok) setItems(prev => prev.filter(x=>String(x.id)!==String(id)));
  }

  function openEdit(row) {
    setEditing(row);
    setEditForm({
      id: row.id,
      nombre: row.nombre || row.name || "",
      precio_usd: String(row.precio_usd ?? row.price_usd ?? row.precio ?? 0),
      categoria: row.categoria || "Singles",
      imagen: row.imagen || row.image || "",
      descripcion: row.descripcion || row.description || "",
      stock: Number(row.stock ?? 10),
      file: null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdit() {
    try {
      setEditSaving(true);

      let imageUrl = editForm.imagen || "";
      if (editForm.file) {
        try {
          setEditImgUploading(true);
          imageUrl = await uploadImageToCloudinary(editForm.file);
        } finally {
          setEditImgUploading(false);
        }
      }

      const body = {
        nombre: editForm.nombre.trim(),
        precio_usd: Number(String(editForm.precio_usd).replace(/[^\d.-]/g,"")) || 0,
        categoria: editForm.categoria,
        imagen: imageUrl || undefined,
        descripcion: editForm.descripcion || "",
        stock: Number(editForm.stock || 0),
        moneda: "USD",
      };
      if (!body.nombre || body.precio_usd <= 0) {
        alert("Completá nombre y precio USD (>0).");
        return;
      }

      const resp = await fetch(`${API_BASE}/productos/${editForm.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const updated = await resp.json();
      if (!resp.ok) {
        console.error(updated);
        alert("No se pudo editar el producto.");
        return;
      }
      setItems(prev => prev.map(x => String(x.id) === String(editForm.id) ? updated : x));
      setEditing(null);
      alert("Producto actualizado ✅");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Backoffice</h1>
        <button onClick={logout} className="text-sm underline">Salir</button>
      </div>
      <div className="text-xs text-neutral-500 mb-4">
        {rateLoading ? "Actualizando cotización..." : rate ? `Cotización blue: ${currency(rate, "ARS")} por USD` : "Sin cotización"}
      </div>

      {/* ====== Panel de edición (si está activo) ====== */}
      {editing && (
        <section className="mb-8 border rounded-2xl p-4 bg-neutral-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Editar producto #{editing.id}</h2>
            <button className="text-sm underline" onClick={()=>setEditing(null)}>Cerrar</button>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            <input className="border rounded-xl px-3 py-2" placeholder="Nombre" value={editForm.nombre} onChange={e=>setEditForm(f=>({...f,nombre:e.target.value}))}/>
            <input className="border rounded-xl px-3 py-2" placeholder="Precio USD" value={editForm.precio_usd} onChange={e=>setEditForm(f=>({...f,precio_usd:e.target.value}))}/>
            <select className="border rounded-xl px-3 py-2" value={editForm.categoria} onChange={e=>setEditForm(f=>({...f,categoria:e.target.value}))}>
              <option>Singles</option>
              <option>Booster Pack</option>
              <option>Booster Box</option>
              <option>Accesorios</option>
              <option>Ofertas</option>
            </select>
            <input className="border rounded-xl px-3 py-2" placeholder="URL de imagen" value={editForm.imagen} onChange={e=>setEditForm(f=>({...f,imagen:e.target.value}))}/>
            <input className="border rounded-xl px-3 py-2" type="number" min={0} placeholder="Stock" value={editForm.stock} onChange={e=>setEditForm(f=>({...f,stock:e.target.value}))}/>
            <div className="border rounded-xl px-3 py-2">
              <label className="text-sm block mb-1">Subir nueva imagen (opcional)</label>
              <input type="file" accept="image/*" onChange={(e)=>setEditForm(f=>({...f,file:e.target.files?.[0] || null}))}/>
              <div className="text-xs text-neutral-500 mt-1">
                {editImgUploading ? "Subiendo..." : CLOUD_NAME ? "Se usará Cloudinary (unsigned)" : "Cloudinary no configurado. Pegá una URL."}
              </div>
            </div>
            <textarea className="sm:col-span-2 md:col-span-3 border rounded-xl px-3 py-2" rows={3} placeholder="Descripción" value={editForm.descripcion} onChange={e=>setEditForm(f=>({...f,descripcion:e.target.value}))}/>
          </div>
          <div className="mt-4 flex gap-3">
            <button onClick={saveEdit} disabled={editSaving} className="rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-60">
              {editSaving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={()=>setEditing(null)} className="rounded-xl border px-4 py-2 text-sm">Cancelar</button>
          </div>
        </section>
      )}

      {/* ====== Nuevo producto ====== */}
      <section className="border rounded-2xl p-4">
        <h2 className="font-medium mb-3">Nuevo producto (precio en USD)</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          <input className="border rounded-xl px-3 py-2" placeholder="Nombre" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
          <input className="border rounded-xl px-3 py-2" placeholder="Precio USD" value={form.precio_usd} onChange={e=>setForm(f=>({...f,precio_usd:e.target.value}))}/>
          <select className="border rounded-xl px-3 py-2" value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}>
            <option>Singles</option>
            <option>Booster Pack</option>
            <option>Booster Box</option>
            <option>Accesorios</option>
            <option>Ofertas</option>
          </select>

          <input className="border rounded-xl px-3 py-2" placeholder="URL de imagen (opcional)" value={form.imagen} onChange={e=>setForm(f=>({...f,imagen:e.target.value}))}/>
          <div className="border rounded-xl px-3 py-2">
            <label className="text-sm block mb-1">o Subir imagen</label>
            <input type="file" accept="image/*" onChange={(e)=>setForm(f=>({...f,file:e.target.files?.[0] || null}))}/>
            <div className="text-xs text-neutral-500 mt-1">
              {imgUploading ? "Subiendo..." : CLOUD_NAME ? "Se usará Cloudinary (unsigned)" : "Cloudinary no configurado. Pegá una URL."}
            </div>
          </div>

          <input className="border rounded-xl px-3 py-2" type="number" min={0} placeholder="Stock" value={form.stock} onChange={e=>setForm(f=>({...f,stock:e.target.value}))}/>
          <textarea className="sm:col-span-2 md:col-span-3 border rounded-xl px-3 py-2" rows={3} placeholder="Descripción" value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={createProduct}
            disabled={saving || imgUploading}
            className="rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Guardando…" : imgUploading ? "Subiendo imagen…" : "Crear producto"}
          </button>
          <button
            onClick={()=>setForm({ nombre:"", precio_usd:"", categoria:"Singles", imagen:"", descripcion:"", stock:10, file:null })}
            className="rounded-xl border px-4 py-2 text-sm"
          >
            Limpiar
          </button>
        </div>
      </section>

      {/* ====== Listado ====== */}
      <section className="mt-8">
        <h2 className="font-medium mb-3">Productos existentes</h2>
        {loading ? (
          <div className="py-8 text-center">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-neutral-500">No hay productos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Nombre</th>
                  <th className="py-2 pr-3">USD</th>
                  <th className="py-2 pr-3">ARS (calc.)</th>
                  <th className="py-2 pr-3">Categoria</th>
                  <th className="py-2 pr-3">Stock</th>
                  <th className="py-2 pr-3">Imagen</th>
                  <th className="py-2 pr-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => {
                  const usd = Number(row.precio_usd ?? row.price_usd ?? row.precio ?? 0);
                  const arsCalc = (row.moneda === "USD" && rate) ? usd * rate : null;
                  return (
                    <tr key={row.id} className="border-b last:border-none">
                      <td className="py-2 pr-3">{row.id}</td>
                      <td className="py-2 pr-3">{row.nombre || row.name}</td>
                      <td className="py-2 pr-3">{currency(usd, "USD")}</td>
                      <td className="py-2 pr-3">{arsCalc ? currency(arsCalc, "ARS") : (row.moneda === "USD" ? "—" : currency(row.precio || 0, "ARS"))}</td>
                      <td className="py-2 pr-3">{row.categoria}</td>
                      <td className="py-2 pr-3">{row.stock ?? 0}</td>
                      <td className="py-2 pr-3">
                        {row.imagen ? <img src={row.imagen} alt="" className="w-12 h-12 object-cover rounded" /> : "-"}
                      </td>
                      <td className="py-2 flex gap-3">
                        <button onClick={()=>openEdit(row)} className="text-blue-600 underline">Editar</button>
                        <button onClick={()=>deleteProduct(row.id)} className="text-red-600 underline">Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

/** ====== RUTAS ====== */
function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/productos" element={<Products />} />
          <Route path="/producto/:id" element={<ProductDetail />} />
          <Route path="/carrito" element={<CartPage />} />
          <Route path="/contacto" element={<Contact />} />

          {/* Admin */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </CartProvider>
  );
}

export default App;

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
