// POST /api/create-pix
// Cria a cobrança PIX na GoatPay e registra um "pedido" (order) pendente no Supabase.
// O preço é calculado AQUI no servidor — nunca confiamos no valor vindo do navegador.

const { sb, goat, token } = require('./_lib');

const BASE_PRICE = 19.90; // R$
const COUPONS = {
  PRIMEIRA10: { type: 'pct', val: 10 },
  BEMVINDO5:  { type: 'fix', val: 5 }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido' }); return; }
  if (!process.env.GOATPAY_API_KEY || !process.env.SUPABASE_URL) {
    res.status(500).json({ error: 'Backend não configurado (variáveis de ambiente ausentes).' }); return;
  }
  try {
    const b = req.body || {};
    const name   = String(b.name  || '').slice(0, 120);
    const email  = String(b.email || '').trim();
    const coupon = String(b.coupon || '').trim().toUpperCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: 'E-mail inválido' }); return; }

    let amount = BASE_PRICE;
    const c = COUPONS[coupon];
    if (c) amount = c.type === 'pct' ? amount * (1 - c.val / 100) : Math.max(1, amount - c.val);
    amount = Math.round(amount * 100) / 100;

    const externalReference = 'quita-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const claim = token();

    const { ok, j } = await goat('payment-pix/create', {
      method: 'POST',
      body: JSON.stringify({ amount, description: 'Acesso completo Quita', coverFee: false, payerName: name, externalReference })
    });
    if (!ok || !j.success || !j.data) { res.status(502).json({ error: (j && j.message) || 'Falha ao criar cobrança PIX' }); return; }

    const d = j.data;
    await sb('orders', {
      method: 'POST', prefer: 'return=minimal',
      body: JSON.stringify({ external_reference: externalReference, claim_token: claim, charge_id: d.id, name, email, amount: d.amount, status: 'pending' })
    });

    res.status(200).json({ id: d.id, amount: d.amount, copyPaste: d.copyPaste, qrCodeBase64: d.qrCodeBase64, qrcodeUrl: d.qrcodeUrl, expiresAt: d.expiresAt, claim });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar cobrança' });
  }
};
