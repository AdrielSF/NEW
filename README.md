# ImplantaPro V2 — base profissional multiusuário

Esta é uma reestruturação do `ImplantaPro_ADM_final.html` para uma arquitetura web com:

- Front-end separado do servidor
- API REST
- PostgreSQL
- autenticação por sessão HTTP segura
- perfis Administrador, Gerente, Implantador e Consulta
- clientes, responsáveis e implantações
- checklist
- comentários
- histórico/auditoria
- dashboard
- importação/exportação XLSX
- validação do prazo máximo de 15 dias úteis
- Docker para banco PostgreSQL

## Importante

Este pacote é uma **base funcional para análise e evolução**, não uma declaração de que o sistema já está pronto para produção empresarial. Antes do uso real, configure HTTPS, segredos fortes, backup, monitoramento, política de retenção, testes de segurança e revisão das regras de negócio.

## Requisitos

- Node.js 20+
- Docker + Docker Compose

## Como executar

1. Suba o banco:

```bash
docker compose up -d db
```

2. Instale as dependências:

```bash
cd backend
npm install
```

3. Crie o arquivo `.env` a partir de `.env.example`.

4. Crie as tabelas e usuário inicial:

```bash
npm run db:init
npm run db:seed
```

5. Inicie a API:

```bash
npm run dev
```

6. Abra:

http://localhost:3000

Usuário inicial de desenvolvimento:
- usuário: `admin`
- senha: `TroqueEstaSenha123!`

**Troque a senha antes de qualquer uso real.**

## Estrutura

```text
ImplantaPro_V2_Profissional/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js
│   │   ├── auth.js
│   │   └── schema.sql
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── database/
│   └── docker-compose.yml
├── legacy/
│   └── ImplantaPro_ADM_final.html
└── MIGRATION.md
```

## Próxima etapa recomendada

Depois de validar esta base, migrar visualmente todos os componentes do HTML legado para React/TypeScript sem alterar o modelo de dados e a API.
