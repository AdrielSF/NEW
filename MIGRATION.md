# Mapeamento do ImplantaPro legado → V2

## Armazenamento

Legado:
- `implantapro_dados_v2`
- `implantapro_historico_v1`
- `implantapro_responsaveis_v1`
- `implantapro_usuarios_v1`
- `implantapro_sessao_v1`

V2:
- PostgreSQL
- `users`
- `responsaveis`
- `clients`
- `implementations`
- `checklist_items`
- `comments`
- `audit_logs`
- sessão HTTP no servidor

## Funções principais

| Legado | V2 |
|---|---|
| `save()` | `PUT/POST /api/implementations` |
| `saveHistory()` | `audit_logs` gerado no backend |
| `saveUsers()` | `/api/users` |
| `saveOwners()` | `/api/responsaveis` |
| `loadSession()` | `GET /api/auth/me` |
| `hashPassword()` | Argon2id no backend |
| `renderDashboard()` | `GET /api/dashboard` + renderização |
| `metrics()` | consultas agregadas no PostgreSQL |
| `addBusinessDays()` | `businessDays.js` no backend |
| `isLate()` | cálculo/indicador no backend |
| `importXlsx()` | endpoint de importação com validação |
| `exportXlsx()` | endpoint de exportação |
| `generateManagementSummary()` | endpoint de relatório |

## Correções de segurança aplicadas

1. Remoção do armazenamento de senha no navegador.
2. Remoção do acesso convidado para dados reais.
3. Remoção das credenciais administrativas hard-coded da aplicação.
4. Permissões verificadas no servidor.
5. Auditoria centralizada.
6. Validação de entrada no servidor.
7. SQL parametrizado.
8. Cookies de sessão `HttpOnly`, `SameSite=Lax`.
9. Helmet e rate limit no login.

## Regras de negócio preservadas

- Status:
  - Em andamento
  - Pausado/CS
  - Pausado/Desenv
  - Concluído
  - Cancelado
- Motivos de pausa.
- Checklist.
- Comentários.
- Prazo máximo de 15 dias úteis.

## Regra adicionada

A API rejeita prazo anterior à data de início e prazo superior a 15 dias úteis após o início.

## Migração dos dados antigos

O HTML legado fica em `legacy/` apenas como referência.

A migração real deve:
1. exportar os dados do navegador antigo;
2. validar duplicidades;
3. criar clientes;
4. criar responsáveis;
5. importar implantações;
6. converter checklist/comentários;
7. preservar histórico;
8. validar totais antes de liberar o V2.
