// Shared helpers for all /api functions. Files starting with "_" are NOT routes.
// Uses Supabase REST (PostgREST) with the SERVICE ROLE key — server-side only,
// never exposed to the browser. No npm dependencies required.

const crypto = require('crypto');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Supabase REST helper ---
async function sb(path, opts = {}) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    body: opts.body,
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  const text = await r.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!r.ok) { const e = new Error('Supabase ' + r.status + ': ' + text); e.status = r.status; throw e; }
  return data;
}

// --- GoatPay helper ---
async function goat(path, opts = {}) {
  const r = await fetch('https://api.goatpay.com.br/v1/' + path, {
    method: opts.method || 'GET',
    body: opts.body,
    headers: { 'X-API-Key': process.env.GOATPAY_API_KEY, 'Content-Type': 'application/json' }
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

// --- credentials ---
function rnd(n) { const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let o = ''; for (let i = 0; i < n; i++) o += s[Math.floor(Math.random() * s.length)]; return o; }
function genCreds(name) {
  const first = String(name || 'cliente').split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') || 'cliente';
  return {
    username: first + Math.floor(100 + Math.random() * 899),
    password: Math.random().toString(36).slice(2, 8).toUpperCase(),
    recovery_code: 'QUITA-' + rnd(4) + '-' + rnd(4)
  };
}
function token() { return crypto.randomBytes(18).toString('hex'); }

// --- webhook signature (HMAC-SHA256 over the raw body) ---
function verifyHmac(raw, sigHeader, secret) {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(typeof raw === 'string' ? raw : Buffer.from(raw)).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex'), b = Buffer.from(sigHeader.slice(7), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// --- fulfillment: create the customer + mark order paid (idempotent) ---
async function fulfillOrder(order) {
  if (order.status === 'paid' && order.customer_id) {
    const cs = await sb('customers?id=eq.' + order.customer_id + '&select=*');
    return { ...order, _customer: cs && cs[0] };
  }
  const creds = genCreds(order.name);
  const now = new Date().toISOString();
  const created = await sb('customers', {
    method: 'POST',
    body: JSON.stringify({
      name: order.name, email: order.email,
      username: creds.username, password: creds.password, recovery_code: creds.recovery_code,
      status: 'active', amount: order.amount, txid: order.charge_id,
      created_at: now, last_access: now
    })
  });
  const customer = Array.isArray(created) ? created[0] : created;
  await sb('orders?id=eq.' + order.id, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'paid', customer_id: customer.id, paid_at: now }) });
  return { ...order, status: 'paid', customer_id: customer.id, _customer: customer };
}

module.exports = { sb, goat, genCreds, token, verifyHmac, fulfillOrder };
