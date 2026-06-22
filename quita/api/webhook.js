// POST /api/webhook  (cadastre esta URL na GoatPay)
// Recebe eventos da GoatPay, valida a assinatura HMAC-SHA256 sobre o corpo bruto,
// é idempotente (não processa a mesma entrega duas vezes) e, em payment.paid,
// libera o acesso do cliente.

const { sb, verifyHmac, fulfillOrder } = require('./_lib');

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const secret = process.env.GOATPAY_WEBHOOK_SECRET;
  let raw = '';
  try { raw = await readRaw(req); } catch { res.status(400).json({ ok: false }); return; }

  if (!secret || !verifyHmac(raw, req.headers['x-goatpay-signature'], secret)) {
    res.status(401).json({ ok: false }); return;
  }

  let body;
  try { body = JSON.parse(raw); } catch { res.status(400).json({ ok: false }); return; }

  try {
    // idempotência: a primeira inserção do delivery id grava; duplicata dá 409 → já processado
    if (body.id) {
      try {
        await sb('webhook_deliveries', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ id: body.id }) });
      } catch (e) {
        if (e.status === 409) { res.status(200).json({ ok: true, duplicate: true }); return; }
      }
    }

    if (body.event === 'payment.paid' && body.data && body.data.externalReference) {
      const rows = await sb('orders?external_reference=eq.' + encodeURIComponent(body.data.externalReference) + '&select=*');
      const order = rows && rows[0];
      if (order && order.status !== 'paid') await fulfillOrder(order);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    // responde 200 para evitar tempestade de retentativas; o erro fica nos logs da Vercel
    res.status(200).json({ ok: true });
  }
};
