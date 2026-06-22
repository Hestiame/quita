// POST /api/login  { user, pass }
// Valida as credenciais contra a tabela customers (Supabase) e devolve o perfil.
// É isto que faz o login funcionar em qualquer dispositivo, com as credenciais
// geradas na compra ou liberadas pelo admin/suporte.

const { sb } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido' }); return; }
  try {
    const b = req.body || {};
    const user = String(b.user || '').trim();
    const pass = String(b.pass || '');
    if (!user || !pass) { res.status(400).json({ error: 'Informe usuário e senha' }); return; }

    const rows = await sb('customers?username=eq.' + encodeURIComponent(user) + '&select=*');
    const c = rows && rows[0];
    if (!c || c.password !== pass) { res.status(401).json({ error: 'Usuário ou senha incorretos' }); return; }
    if (c.status === 'refunded') { res.status(403).json({ error: 'Acesso indisponível. Fale com o suporte.' }); return; }

    try { await sb('customers?id=eq.' + c.id, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ last_access: new Date().toISOString() }) }); } catch (e) {}

    res.status(200).json({ ok: true, user: { name: c.name, email: c.email, user: c.username, pass: c.password, recovery: c.recovery_code, status: c.status } });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao entrar' });
  }
};
