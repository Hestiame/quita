// POST /api/admin  — roteador do painel, protegido por usuário/senha (env ADMIN_USER/ADMIN_PASS).
// A senha trafega no corpo sobre HTTPS. Em uma fase futura, troque por Supabase Auth (JWT).
//
// Ações:
//   { action:'login' }                         → { ok }
//   { action:'data' }                          → { customers, tickets }
//   { action:'reply', id, reply }              → grava resposta (status answered)
//   { action:'close', id }                     → fecha chamado
//   { action:'set-status', id, status }        → muda status do cliente
//   { action:'grant', id }                     → cria/ativa cliente do chamado e envia credenciais

const { sb, genCreds } = require('./_lib');

function authed(b) {
  return b && b.user === process.env.ADMIN_USER && b.pass === process.env.ADMIN_PASS && !!process.env.ADMIN_PASS;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const b = req.body || {};

  if (b.action === 'login') { res.status(200).json({ ok: authed(b) }); return; }
  if (!authed(b)) { res.status(401).json({ error: 'Não autorizado' }); return; }

  try {
    const a = b.action;

    if (a === 'data') {
      const customers = await sb('customers?select=*&order=created_at.desc');
      const tickets = await sb('tickets?select=*&order=created_at.desc');
      res.status(200).json({ customers: customers || [], tickets: tickets || [] }); return;
    }

    if (a === 'reply') {
      await sb('tickets?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ reply: String(b.reply || ''), status: 'answered', reply_seen: false, replied_at: new Date().toISOString() }) });
      res.status(200).json({ ok: true }); return;
    }

    if (a === 'close') {
      await sb('tickets?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'closed' }) });
      res.status(200).json({ ok: true }); return;
    }

    if (a === 'set-status') {
      await sb('customers?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: String(b.status || 'active') }) });
      res.status(200).json({ ok: true }); return;
    }

    if (a === 'grant') {
      const tk = (await sb('tickets?id=eq.' + encodeURIComponent(b.id) + '&select=*'))[0];
      if (!tk) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }
      let c = (await sb('customers?email=eq.' + encodeURIComponent(tk.email) + '&select=*'))[0];
      if (!c) {
        const cr = genCreds(tk.name); const now = new Date().toISOString();
        c = (await sb('customers', { method: 'POST', body: JSON.stringify({
          name: tk.name || 'Cliente', email: tk.email, username: cr.username, password: cr.password,
          recovery_code: cr.recovery_code, status: 'active', amount: 19.90, txid: 'MANUAL', created_at: now, last_access: now
        }) }))[0];
      } else {
        await sb('customers?id=eq.' + c.id, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'active' }) });
      }
      const reply = 'Acesso liberado! ✅<br><b>Usuário:</b> ' + c.username + '<br><b>Senha:</b> ' + c.password + '<br><b>Código de resgate:</b> ' + c.recovery_code + '<br>Guarde em local seguro.';
      await sb('tickets?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ reply, status: 'answered', reply_seen: false, replied_at: new Date().toISOString() }) });
      res.status(200).json({ ok: true }); return;
    }

    res.status(400).json({ error: 'Ação desconhecida' });
  } catch (e) {
    res.status(500).json({ error: 'Erro no painel' });
  }
};
