// /api/support
//   POST { name, email, topic, message, proof, protocol }  → cria chamado
//   POST { action:'seen', ids:[...] }                       → marca respostas como vistas
//   GET  ?email=<email>                                     → respostas não vistas do cliente

const { sb } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const b = req.body || {};

      if (b.action === 'seen' && Array.isArray(b.ids) && b.ids.length) {
        const list = b.ids.map(encodeURIComponent).join(',');
        await sb('tickets?id=in.(' + list + ')', { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ reply_seen: true }) });
        res.status(200).json({ ok: true }); return;
      }

      const proto = String(b.protocol || ('#' + Date.now().toString(36).toUpperCase().slice(-6)));
      const row = {
        protocol: proto,
        name:  String(b.name  || '').slice(0, 120),
        email: String(b.email || '').slice(0, 160),
        topic: String(b.topic || 'Dúvida').slice(0, 120),
        message: String(b.message || '').slice(0, 4000),
        proof: b.proof || null,
        status: 'open'
      };
      await sb('tickets', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(row) });
      res.status(200).json({ ok: true, protocol: proto }); return;
    }

    if (req.method === 'GET') {
      const email = (req.query && req.query.email) || '';
      if (!email) { res.status(400).json({ error: 'email obrigatório' }); return; }
      const rows = await sb('tickets?email=eq.' + encodeURIComponent(email) + '&reply=not.is.null&reply_seen=eq.false&select=id,protocol,reply');
      res.status(200).json({ replies: rows || [] }); return;
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: 'Erro no suporte' });
  }
};
