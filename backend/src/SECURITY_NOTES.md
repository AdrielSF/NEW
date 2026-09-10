# Segurança antes de produção

- Trocar sessão em memória por Redis ou store persistente.
- Usar HTTPS obrigatório.
- Definir `SESSION_SECRET` forte.
- Restringir CORS a origens conhecidas.
- Ativar CSP adequada.
- Adicionar CSRF protection se a estratégia de cookie for mantida.
- Implementar recuperação de senha e MFA se necessário.
- Fazer backup PostgreSQL automático.
- Adicionar logs estruturados e monitoramento.
- Validar tamanho/formato de todos os uploads.
- Criar testes de autorização para cada perfil.
- Criar testes de concorrência e integridade.
- Adicionar paginação nas consultas grandes.
- Avaliar soft-delete para implantações em vez de exclusão física.
- Substituir o frontend vanilla por React/TypeScript na etapa de consolidação, se esse for o padrão tecnológico desejado.
