import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { notify, askConfirm } from '../components/Dialog';
import { PreviewModal } from '../components/Preview';
import { driveThumb, isPreviewable } from '../utils/drive';

// Group an order's thumbnails by item so each row shows variant + its
// designs/mockups together. Data is already eager-loaded by the orders index.
function orderItemGroups(order) {
  return (order.items || []).map(it => {
    const pv = it.product_variant;
    const variantText = pv
      ? `${pv.product?.name || `Variant #${pv.id}`}${pv.color || pv.size ? ` — ${[pv.color, pv.size].filter(Boolean).join('/')}` : ''}`
      : `Item #${it.id}`;

    const materialName = it.material?.name || null;
    const accSrc = (it.accessory_prices && it.accessory_prices.length) ? it.accessory_prices
      : (it.accessory_price ? [it.accessory_price] : []);
    const accessories = accSrc.map(a => ({
      type: a.accessory?.name || 'Accessory',
      code: a.accessory_code || a.style || '',
    }));

    const thumbs = [];
    if (it.mockup_front) thumbs.push({ url: it.mockup_front, label: 'mockup front' });
    if (it.mockup_back) thumbs.push({ url: it.mockup_back, label: 'mockup back' });
    for (const m of (it.metas || [])) {
      const key = m?.key || '';
      if (m?.value && isPreviewable(m.value) && !/_qr(_[0-9]+)?$/.test(key)) {
        thumbs.push({ url: m.value, label: `design ${key}` });
      }
    }
    return { variantText, qty: it.quantity, materialName, accessories, thumbs };
  });
}

function OrderThumb({ url, label, onOpen }) {
  if (!isPreviewable(url)) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(url); }}
      title={label}
      className="h-9 w-9 rounded border border-neutral-200 bg-neutral-100 overflow-hidden hover:ring-2 hover:ring-orange-400 shrink-0"
    >
      <img src={driveThumb(url, 'w200')} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
    </button>
  );
}

const STATUS_MAP = ['new_order', 'processing', 'wrongsize', 'fixed', 'reprint', 'onhold', 'shipped', 'cancelled'];
const SELLER_STATUS_OPTIONS = [5, 7]; // onhold, cancelled
const STATUS_COLORS = {
  0: 'bg-blue-100 text-blue-600',
  1: 'bg-yellow-100 text-yellow-600',
  2: 'bg-red-100 text-red-600',
  3: 'bg-green-100 text-green-600',
  4: 'bg-orange-100 text-orange-600',
  5: 'bg-gray-100 text-gray-600',
  6: 'bg-emerald-100 text-emerald-600',
  7: 'bg-rose-100 text-rose-600',
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  // Restore last filter+page from sessionStorage so navigating into an order
  // and back keeps the user on the same page they were browsing.
  const [filters, setFilters] = useState(() => {
    const def = { status: '', ref_id: '', system_id: '', date_from: '', date_to: '', page: 1, per_page: 20 };
    try {
      const saved = JSON.parse(sessionStorage.getItem('orders_filters') || 'null');
      return saved && typeof saved === 'object' ? { ...def, ...saved } : def;
    } catch { return def; }
  });
  useEffect(() => { sessionStorage.setItem('orders_filters', JSON.stringify(filters)); }, [filters]);
  const [selected, setSelected] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const { hasPermission, user: authUser } = useAuth();
  const navigate = useNavigate();

  // Pay-All preview modal state
  const [showPayAll, setShowPayAll] = useState(false);
  const [payAllSummary, setPayAllSummary] = useState(null);
  const [payAllLoading, setPayAllLoading] = useState(false);

  // Seller's own unpaid totals — shown as banner above the list
  const [unpaidBanner, setUnpaidBanner] = useState(null);
  const refreshUnpaidBanner = () => {
    api.get('/orders/unpaid-summary').then(res => setUnpaidBanner(res.data)).catch(() => {});
  };

  useEffect(() => {
    refreshUnpaidBanner();
  }, [authUser?.id]);

  const fetchOrders = () => {
    setLoading(true);
    const params = { page: filters.page, per_page: filters.per_page || 20 };
    if (filters.status !== '') params.status = filters.status;
    if (filters.ref_id) params.ref_id = filters.ref_id;
    if (filters.system_id) params.system_id = filters.system_id;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;

    api.get('/orders', { params }).then(res => {
      setOrders(res.data.data);
      setMeta(res.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(); refreshUnpaidBanner(); }, [filters.page, filters.status, filters.date_from, filters.date_to, filters.per_page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters(f => ({ ...f, page: 1 }));
    fetchOrders();
  };

  const handleBulkStatus = async (status) => {
    if (selected.length === 0) return;
    await api.post('/orders/bulk-status', { order_ids: selected, status });
    setSelected([]);
    fetchOrders();
  };

  const handleExport = async () => {
    const params = {};
    if (filters.status !== '') params.status = filters.status;
    if (filters.ref_id) params.ref_id = filters.ref_id;
    if (filters.system_id) params.system_id = filters.system_id;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    if (selected.length > 0) params.order_ids = selected.join(',');
    try {
      const res = await api.get('/orders/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `orders_${selected.length > 0 ? `selected_${selected.length}_` : ''}${stamp}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      notify(
        selected.length > 0
          ? `Exported ${selected.length} selected order(s)`
          : 'Exported orders matching current filters',
        { title: 'Export', kind: 'success' }
      );
    } catch (err) {
      notify(err.response?.data?.message || 'Export failed', { title: 'Export failed', kind: 'error' });
    }
  };

  const handleBulkPay = async () => {
    if (selected.length === 0) return;

    // Frontend pre-check: sum unpaid amounts of selected orders, compare against wallet.
    try {
      const balanceRes = await api.get('/wallet/balance');
      const wallet = parseFloat(balanceRes.data.wallet) || 0;
      const required = orders
        .filter(o => selected.includes(o.id))
        .reduce((sum, o) => {
          const remain = (parseFloat(o.total_cost) || 0) - (parseFloat(o.paid_cost) || 0);
          return remain > 0 ? sum + remain : sum;
        }, 0);
      if (required <= 0) {
        return notify('All selected orders are already fully paid.', { title: 'Nothing to pay' });
      }
      if (wallet < required) {
        return notify(`Insufficient wallet balance.\nRequired: $${required.toFixed(2)}\nWallet: $${wallet.toFixed(2)}\nShort by: $${(required - wallet).toFixed(2)}`, { title: 'Cannot pay', kind: 'error' });
      }
      const ok = await askConfirm(`Pay ${selected.length} order(s) for $${required.toFixed(2)}?`, { title: 'Confirm bulk pay', okText: 'Pay' });
      if (!ok) return;
    } catch {
      // If balance check fails, fall through and let backend enforce.
    }

    try {
      const res = await api.post('/orders/bulk-pay', { order_ids: selected });
      await notify(res.data.message, { title: 'Bulk pay', kind: 'success' });
      setSelected([]);
      fetchOrders();
      refreshUnpaidBanner();
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.required != null && d?.wallet != null
        ? `${d.message}.\nRequired: $${d.required}\nWallet: $${d.wallet}`
        : (d?.message || 'Error');
      notify(msg, { title: 'Bulk pay failed', kind: 'error' });
    }
  };

  const handleCopyIds = async () => {
    if (selected.length === 0) return;
    const ids = orders.filter(o => selected.includes(o.id)).map(o => o.system_id).filter(Boolean);
    if (ids.length === 0) return;
    const text = ids.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${ids.length} system ID${ids.length > 1 ? 's' : ''} to clipboard`, { kind: 'success' });
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      notify(`Copied ${ids.length} system ID${ids.length > 1 ? 's' : ''}`, { kind: 'success' });
    }
  };


  const fetchPayAllSummary = async (userId) => {
    setPayAllLoading(true);
    setPayAllSummary(null);
    try {
      const params = userId ? { user_id: userId } : {};
      const res = await api.get('/orders/unpaid-summary', { params });
      setPayAllSummary(res.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Error fetching summary', { title: 'Error', kind: 'error' });
      setShowPayAll(false);
    } finally {
      setPayAllLoading(false);
    }
  };

  const openPayAll = () => {
    setShowPayAll(true);
    setPayAllSummary(null);
    fetchPayAllSummary(null);
  };

  const confirmPayAll = async () => {
    if (!payAllSummary) return;
    if (payAllSummary.short > 0) return;
    setPayAllLoading(true);
    try {
      const res = await api.post('/orders/pay-all-unpaid');
      setShowPayAll(false);
      await notify(res.data.message, { title: 'Pay all unpaid', kind: 'success' });
      fetchOrders();
      refreshUnpaidBanner();
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.required != null && d?.wallet != null
        ? `${d.message}.\nRequired: $${d.required}\nWallet: $${d.wallet}\nShort by: $${(d.required - d.wallet).toFixed(2)}`
        : (d?.message || 'Error');
      notify(msg, { title: 'Cannot pay all', kind: 'error' });
    } finally {
      setPayAllLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === orders.length) {
      setSelected([]);
    } else {
      setSelected(orders.map(o => o.id));
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-neutral-800">Orders</h2>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm rounded-lg transition-colors"
            title={selected.length > 0 ? `Export ${selected.length} selected to CSV` : 'Export filtered orders to CSV'}
          >
            Export {selected.length > 0 ? `(${selected.length})` : 'CSV'}
          </button>
          <button onClick={openPayAll} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors">
            Pay All Unpaid
          </button>
          {hasPermission('orders', 'can_create') && (
            <Link to="/orders/create" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors">
              New Order
            </Link>
          )}
        </div>
      </div>

      {/* Seller unpaid banner */}
      {unpaidBanner && unpaidBanner.count > 0 && (
        <div className={`mb-4 px-4 py-3 rounded-lg border flex items-center justify-between gap-4 ${
          unpaidBanner.short > 0
            ? 'bg-red-50 border-red-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-neutral-600">Pending unpaid:</span>
            <span className="font-semibold text-neutral-800">{unpaidBanner.count} order{unpaidBanner.count > 1 ? 's' : ''}</span>
            <span className="text-neutral-300">·</span>
            <span className="text-neutral-600">Total to pay:</span>
            <span className="font-semibold text-red-600">${Number(unpaidBanner.total_unpaid).toFixed(2)}</span>
            <span className="text-neutral-300">·</span>
            <span className="text-neutral-600">Wallet:</span>
            <span className="font-semibold text-neutral-800">${Number(unpaidBanner.wallet).toFixed(2)}</span>
            {unpaidBanner.short > 0 && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="text-red-600 font-medium">Short by ${Number(unpaidBanner.short).toFixed(2)}</span>
              </>
            )}
          </div>
          <button onClick={openPayAll} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs rounded-lg whitespace-nowrap">
            Pay All
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search system_id..."
            value={filters.system_id}
            onChange={e => setFilters(f => ({ ...f, system_id: e.target.value }))}
            className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-800 text-sm focus:outline-none focus:border-orange-400 w-44 font-mono"
          />
          <input
            type="text"
            placeholder="Search ref_id..."
            value={filters.ref_id}
            onChange={e => setFilters(f => ({ ...f, ref_id: e.target.value }))}
            className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-800 text-sm focus:outline-none focus:border-orange-400 w-44"
          />
          <button type="submit" className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm rounded-lg">Search</button>
        </form>

        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
          className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-700 text-sm focus:outline-none"
        >
          <option value="">All Status</option>
          {STATUS_MAP.map((s, i) => <option key={i} value={i}>{s}</option>)}
        </select>

        <div className="flex items-center gap-1 text-sm">
          <span className="text-xs text-neutral-500">From</span>
          <input
            type="date"
            value={filters.date_from}
            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value, page: 1 }))}
            className="px-2 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-700 text-sm"
          />
          <span className="text-xs text-neutral-500 ml-1">To</span>
          <input
            type="date"
            value={filters.date_to}
            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value, page: 1 }))}
            className="px-2 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-700 text-sm"
          />
          {(filters.date_from || filters.date_to) && (
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, date_from: '', date_to: '', page: 1 }))}
              className="px-2 py-1.5 text-xs text-neutral-500 hover:text-red-500"
              title="Clear date range"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={filters.per_page}
          onChange={e => setFilters(f => ({ ...f, per_page: parseInt(e.target.value), page: 1 }))}
          className="px-2 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-700 text-sm"
          title="Rows per page"
        >
          {[10, 20, 50, 100, 200, 500].map(n => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>

        {selected.length > 0 && (
          <div className="flex gap-2 ml-auto">
            <span className="text-neutral-500 text-sm py-1.5">{selected.length} selected</span>
            <button onClick={handleCopyIds} className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded-lg" title="Copy all selected system IDs to clipboard (newline-separated)">
              Copy IDs
            </button>
            <select
              onChange={e => { if (e.target.value) handleBulkStatus(parseInt(e.target.value)); e.target.value = ''; }}
              className="px-2 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-700 text-xs"
            >
              <option value="">Bulk Status...</option>
              {STATUS_MAP.map((s, i) => (
                SELLER_STATUS_OPTIONS.includes(i)
                  ? <option key={i} value={i}>{s}</option>
                  : null
              ))}
            </select>
            <button onClick={handleBulkPay} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg">
              Bulk Pay
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500 text-xs bg-[#faf8f6]">
              <th className="p-3 text-left w-8">
                <input type="checkbox" onChange={toggleSelectAll} checked={selected.length === orders.length && orders.length > 0} className="accent-orange-500" />
              </th>
              <th className="p-3 text-left">System ID</th>
              <th className="p-3 text-left">Ref ID</th>
              <th className="p-3 text-left">Items</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Ship Type</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Paid</th>
              <th className="p-3 text-left">Shipping</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" className="p-6 text-center text-neutral-400">Loading...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan="10" className="p-6 text-center text-neutral-400">No orders found</td></tr>
            ) : orders.map(order => (
              <tr key={order.id} className="border-b border-neutral-100 hover:bg-orange-50/50 cursor-pointer transition-colors" onClick={() => navigate(`/orders/${order.id}`)}>
                <td className="p-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(order.id)} onChange={() => toggleSelect(order.id)} className="accent-orange-500" />
                </td>
                <td className="p-3 text-orange-500 font-mono text-xs">{order.system_id}</td>
                <td className={`p-3 text-xs ${order.is_duplicate_ref ? 'text-red-600 font-semibold' : 'text-neutral-700'}`}>
                  {order.ref_id ? (
                    <span title={order.is_duplicate_ref ? 'Ref ID duplicated across multiple orders' : ''}>
                      {order.ref_id}
                      {order.is_duplicate_ref && <span className="ml-1 text-[10px] uppercase tracking-wide">dup</span>}
                    </span>
                  ) : <span className="text-neutral-400">-</span>}
                </td>
                <td className="p-3" onClick={e => e.stopPropagation()}>
                  {(() => {
                    const groups = orderItemGroups(order);
                    if (groups.length === 0) return <span className="text-neutral-300 text-xs">—</span>;
                    return (
                      <div className="space-y-1.5 max-w-[220px]">
                        {groups.map((g, gi) => (
                          <div key={gi} className="space-y-0.5">
                            <div className="text-[11px] text-neutral-600 truncate" title={g.variantText}>
                              {g.variantText}{g.qty ? ` · ×${g.qty}` : ''}
                            </div>
                            {(g.materialName || g.accessories.length > 0) && (
                              <div className="flex flex-wrap gap-1 text-[10px]">
                                {g.materialName && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700" title="Material">🧶 {g.materialName}</span>}
                                {g.accessories.map((a, ai) => (
                                  <span key={ai} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700" title="Accessory">
                                    {a.type}{a.code ? `: ${a.code}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-1 flex-wrap">
                              {g.thumbs.length === 0 ? (
                                <span className="text-[10px] text-neutral-300">— no image</span>
                              ) : (<>
                                {g.thumbs.slice(0, 6).map((t, ti) => (
                                  <OrderThumb key={ti} url={t.url} label={t.label} onOpen={setPreviewUrl} />
                                ))}
                                {g.thumbs.length > 6 && <span className="text-[10px] text-neutral-400">+{g.thumbs.length - 6}</span>}
                              </>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status]}`}>{STATUS_MAP[order.status]}</span>
                </td>
                <td className="p-3 text-neutral-600">{order.ship_type}</td>
                <td className="p-3 text-right text-neutral-800 font-medium">${order.total_cost}</td>
                <td className="p-3 text-right">
                  <span className={order.paid_cost >= order.total_cost ? 'text-green-600' : 'text-red-500'}>
                    ${order.paid_cost}
                  </span>
                </td>
                <td className="p-3 text-xs" onClick={e => e.stopPropagation()}>
                  {(() => {
                    const a = order.address;
                    const addrLine = a ? [
                      [a.first_name, a.last_name].filter(Boolean).join(' '),
                      a.address_1,
                      [a.city, a.state, a.zipcode].filter(Boolean).join(' '),
                      a.country,
                    ].filter(Boolean).join(' · ') : '';
                    const has = order.tracking_id || order.shipping_label || addrLine;
                    if (!has) return <span className="text-neutral-300">—</span>;
                    return (
                      <div className="space-y-0.5 max-w-[240px]">
                        {order.tracking_id && <div className="font-mono text-neutral-700 truncate" title={order.tracking_id}>{order.tracking_id}</div>}
                        {order.shipping_label && <a href={order.shipping_label} target="_blank" rel="noreferrer" className="block text-blue-600 hover:underline truncate" title={order.shipping_label}>📄 label</a>}
                        {addrLine && <div className="text-neutral-500 leading-tight truncate" title={addrLine}>📍 {addrLine}</div>}
                      </div>
                    );
                  })()}
                </td>
                <td className="p-3 text-neutral-500 text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.last_page > 1 && (() => {
        const cur = filters.page;
        const last = meta.last_page;
        const span = 2;
        const start = Math.max(1, cur - span);
        const end = Math.min(last, cur + span);
        const pages = [];
        for (let p = start; p <= end; p++) pages.push(p);
        const goto = (p) => setFilters(f => ({ ...f, page: Math.min(Math.max(1, p), last) }));
        return (
          <div className="flex justify-between items-center mt-4 flex-wrap gap-2">
            <div className="text-xs text-neutral-500">
              Page <span className="font-medium text-neutral-700">{cur}</span> of {last} · {meta.total ?? 0} order{(meta.total ?? 0) !== 1 ? 's' : ''}
            </div>
            <div className="flex gap-1">
              <button onClick={() => goto(1)} disabled={cur <= 1} className="px-2 py-1 rounded text-sm bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">«</button>
              <button onClick={() => goto(cur - 1)} disabled={cur <= 1} className="px-2 py-1 rounded text-sm bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">‹</button>
              {start > 1 && <span className="px-2 py-1 text-xs text-neutral-400">…</span>}
              {pages.map(p => (
                <button
                  key={p}
                  onClick={() => goto(p)}
                  className={`px-3 py-1 rounded text-sm ${cur === p ? 'bg-orange-500 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                >{p}</button>
              ))}
              {end < last && <span className="px-2 py-1 text-xs text-neutral-400">…</span>}
              <button onClick={() => goto(cur + 1)} disabled={cur >= last} className="px-2 py-1 rounded text-sm bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">›</button>
              <button onClick={() => goto(last)} disabled={cur >= last} className="px-2 py-1 rounded text-sm bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">»</button>
            </div>
          </div>
        );
      })()}

      {/* Pay-All preview modal */}
      {showPayAll && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowPayAll(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[90%] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-neutral-800 mb-3">Pay All Unpaid Orders</h3>

            {payAllLoading && <p className="text-sm text-neutral-500 py-3">Loading…</p>}

            {payAllSummary && !payAllLoading && (
              <div className="space-y-1.5 text-sm bg-[#faf8f6] rounded-lg p-3 border border-neutral-200">

                <div className="flex justify-between"><span className="text-neutral-500">Unpaid orders</span><span className="text-neutral-800 font-medium">{payAllSummary.count}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Total to pay</span><span className="text-neutral-800 font-semibold">${Number(payAllSummary.total_unpaid).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Wallet balance</span><span className="text-neutral-800">${Number(payAllSummary.wallet).toFixed(2)}</span></div>
                {payAllSummary.short > 0 ? (
                  <div className="flex justify-between border-t border-neutral-200 pt-1.5 mt-1.5">
                    <span className="text-red-500 font-medium">Short by</span>
                    <span className="text-red-500 font-semibold">${Number(payAllSummary.short).toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between border-t border-neutral-200 pt-1.5 mt-1.5">
                    <span className="text-emerald-600 font-medium">After paying</span>
                    <span className="text-emerald-600 font-semibold">${(Number(payAllSummary.wallet) - Number(payAllSummary.total_unpaid)).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {payAllSummary && payAllSummary.count === 0 && (
              <p className="text-sm text-neutral-500 mt-2">No unpaid orders.</p>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPayAll(false)} className="px-4 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm rounded-lg">Cancel</button>
              <button
                onClick={confirmPayAll}
                disabled={!payAllSummary || payAllSummary.count === 0 || payAllSummary.short > 0 || payAllLoading}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg"
              >
                {payAllLoading ? 'Paying…' : `Pay $${payAllSummary ? Number(payAllSummary.total_unpaid).toFixed(2) : '0.00'}`}
              </button>
            </div>
          </div>
        </div>
      )}
      <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
