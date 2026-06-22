// GET /api/pix-status?id=<chargeId>&token=<claim>
// O frontend consulta este endpoint enquanto aguarda o pagamento.
// Quando pago, devolve as credenciais geradas no servidor (consistentes entre dispositivos).
// Se o webhook ainda não chegou, consulta a GoatPay direto e libera na hora (robusto).

const { sb, goat, fulfillOrder } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const id    = (req.query && req.query.id) || '';
    const claim = (req.query && req.query.token) || '';
    if (!id || !claim) { res.status(400).json({ error: 'Parâmetros ausentes' }); return; }

    const rows = await sb('orders?charge_id=eq.' + encodeURIComponent(id) + '&claim_token=eq.' + encodeURIComponent(claim) + '&select=*');
    const order = rows && rows[0];
    if (!order) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }

    const sendPaid = (c) => res.status(200).json({
      paid: true,
      credentials: c ? { user: c.username, pass: c.password, recovery: c.recovery_code, name: c.name, email: c.email } : null
    });

    if (order.status === 'paid' && order.customer_id) {
      const cs = await sb('customers?id=eq.' + order.customer_id + '&select=username,password,recovery_code,name,email');
      sendPaid(cs && cs[0]); return;
    }

    // ainda pendente no nosso banco → confirma direto na GoatPay
    const { ok, j } = await goat('payment-pix/get/' + encodeURIComponent(id));
    if (ok && j.success && j.data && j.data.status === 'COMPLETED') {
      const updated = await fulfillOrder(order);
      sendPaid(updated._customer); return;
    }

    res.status(200).json({ paid: false });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao consultar pagamento' });
  }
};
