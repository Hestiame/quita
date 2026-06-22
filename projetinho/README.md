# Quita — deploy (Vercel + GitHub + Supabase + GoatPay)

Aplicação de página única (`index.html`) + funções serverless em `/api`.
O navegador nunca vê chaves secretas: ele chama `/api/*`, e o servidor (Vercel) fala com a GoatPay e o Supabase.

```
quita/
├── index.html              ← o site
├── package.json
├── supabase/schema.sql     ← tabelas para rodar no Supabase
└── api/
    ├── _lib.js             ← helpers (Supabase, GoatPay, HMAC, fulfillment)
    ├── create-pix.js       ← POST: cria cobrança PIX + pedido pendente
    ├── pix-status.js       ← GET: consulta pagamento e devolve credenciais
    ├── webhook.js          ← POST: recebe confirmação da GoatPay (HMAC)
    ├── support.js          ← POST/GET: chamados de suporte e respostas
    └── admin.js            ← POST: painel (login, dados, responder, liberar)
```

## 1. Supabase
1. Crie um projeto em supabase.com.
2. **SQL Editor → New query** → cole `supabase/schema.sql` → **Run**.
3. **Project Settings → API**: copie `Project URL` e a chave **`service_role`** (a secreta).

## 2. GitHub
1. Suba esta pasta para um repositório no GitHub.
2. **Não** comite chaves — o `.env.example` é só modelo.

## 3. Vercel
1. **Add New → Project → Import** o repositório do GitHub.
2. Framework preset: **Other** (é estático + funções). Deploy.
3. **Settings → Environment Variables** — adicione (Production e Preview):
   - `GOATPAY_API_KEY` = `gp_live_...`
   - `SUPABASE_URL` = `https://....supabase.co`
   - `SUPABASE_SERVICE_KEY` = `service_role...`
   - `ADMIN_USER` = `linguadesogr4`
   - `ADMIN_PASS` = `lingua67`
   - `GOATPAY_WEBHOOK_SECRET` = (preenchido no passo 4)
4. **Redeploy** após salvar as variáveis.

## 4. Webhook da GoatPay
Aponte a GoatPay para `https://SEU-DOMINIO/api/webhook`. Via API:

```bash
curl -X POST 'https://api.goatpay.com.br/v1/webhooks/create' \
  -H 'X-API-Key: gp_live_SUA_CHAVE' \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://SEU-DOMINIO/api/webhook", "events": ["payment.paid"] }'
```

A resposta traz o `whsec_...` **uma única vez**. Coloque-o em `GOATPAY_WEBHOOK_SECRET` na Vercel e **redeploy**.

> Mesmo sem o webhook, o pagamento é confirmado: a tela consulta a GoatPay direto (`pix-status`). O webhook deixa a confirmação instantânea e robusta.

## 5. Testar
1. Abra o site publicado → "Adquirir acesso" → preencha → **Pagar**.
2. Aparece o QR Code PIX (cobrança real). Pague (ou use sandbox, se tiver).
3. Ao confirmar, o acesso é liberado e as credenciais aparecem na tela.
4. Painel: rodapé → **Painel** (ou `/#admin`), entre com `ADMIN_USER`/`ADMIN_PASS`.

## Notas de segurança
- A chave GoatPay e a `service_role` do Supabase ficam **só** nas variáveis da Vercel.
- O painel admin é protegido por usuário/senha enviados sobre HTTPS. Para produção séria, migre para **Supabase Auth (JWT)** e habilite policies de RLS específicas.
- A senha do cliente hoje é guardada em texto (para exibir no painel/recuperação). Se preferir o padrão de mercado, troque por hash (bcrypt) e exiba a senha só uma vez na criação.
