# Alliar — contas e persistência
- [x] Banco multiempresa, perfis e permissões isoladas.
- [x] Login, cadastro, recuperação e saída.
- [x] Criar empresas, alternar empresa e aceitar convites.
- [x] Contatos, leads, funil, propostas, comissões e configurações persistentes.
- [x] Testes de isolamento e fluxo completo com dados reais.
# Alliar — IA, WhatsApp, CNPJ, equipe
- [x] IA ao vivo: copiloto, teleprompter, treino com nota, resumo de voz.
- [x] Busca automática de CNPJ no novo negócio.
- [x] Nomes e e-mails reais da equipe.
- [x] Envio/recebimento WhatsApp, modelos e status (código pronto).
- [ ] Conectar o número de WhatsApp — aguardando o usuário aprovar a conexão.

# Alliar — Pós-Venda, Indicações e Automações de Funil em Tempo Real
- [x] Pós-Venda e Chamados com SLA (/portal): persistência de chamados com protocolo, prioridade e SLA, geração de link mágico dinâmico por cliente e integração com WhatsApp.
- [x] Programa de Indicações (/indicacoes): geração de links mágicos individuais por cliente, acompanhamento de recompensas/cashback e registro automático de conversões ao mover lead para 'Ganho'.
- [x] Automações de Funil em Tempo Real: disparo automático de mensagens de boas-vindas no WhatsApp e motor anti-vácuo com redistribuição round-robin após 5 minutos sem resposta.

# Alliar — Central de Integrações e Webhooks (/integracoes)
- [x] Adicionar à página os recursos B2B do ZIP: conexão individual, CSV, consultas e métricas; navegação e importação verificadas com contato salvo e relido.
- [ ] Ativar serviços adicionais do ZIP (Crunchbase, Google Maps, OpenCorporates) e entregas B2B externas — faltam conexões individuais e destinos autorizados.
- [x] Meta Lead Ads e Google Ads: endpoints de webhook para recepção instantânea de leads com validação de token e disparo de boas-vindas.
- [x] Gateways de Pagamento (Kiwify, Hotmart, Asaas, Stripe, Mercado Pago): endpoints de webhook com normalização de payloads, movimentação automática para 'Ganho', abertura de projeto pós-venda e envio de link mágico no WhatsApp.
- [x] Conexões de WhatsApp (Meta Cloud API, Evolution API, Z-API) com testes de disparo ao vivo.
- [x] Simuladores em tempo real para pagamentos e leads do Instagram Ads com visualização de logs JSON.

# Alliar — Prospecção Ativa B2B (/prospeccao)
- [x] Interface de busca por segmento e cidade (com presets e filtros rápidos).
- [x] Extração e enriquecimento de dados públicos: nome, telefone/WhatsApp comercial com DDD dinâmico, endereço, nota no Google e sócios (QSA).
- [x] Importação em 1 clique (individual e em massa) para o Funil de Vendas com registro de evento na timeline e abordagem direta no WhatsApp.

# Alliar — Ativação de B2B Enrichment
- [x] Atualizar B2B_CREDENTIAL_ENCRYPTION_SECRET no remix — salvo pelo formulário seguro.
- [x] Verificar disponibilidade do importador, endpoints, painel e ferramentas solicitados.
- [x] Adaptar este Alliar ao Lovable Cloud, conforme escolha do usuário.
- [ ] Cada cliente deve conectar sua própria conta Apollo nas configurações; nunca usar a conta do proprietário como compartilhada.
- [ ] Manter CSV e preparar adaptadores para outras APIs, conforme solicitação adicional.
- [ ] Autorizar uma fonte B2B individual e definir empresas/domínios — aguardando disponibilidade do acesso individual e dados do usuário.
- [ ] Implementar e verificar enriquecimento, importação, jobs, painel e métricas com dados reais — depende das definições acima.

# Alliar — Construtor Visual de Automações (/workflows)
- [x] Editor visual em nós: Gatilho (Lead criado/Fase mudada) -> Ação (WhatsApp/Áudio/Chamado) -> Delay (Minutos/Horas/Dias) -> Condição (Respondeu/Abriu proposta).
- [x] Ramificações condicionais completas (Ramo SIM / Ramo NÃO) para réguas complexas estilo GoHighLevel.
- [x] Biblioteca de templates prontos: "Boas-Vindas & Follow-up Fantasma", "Radar de Proposta & PIX 5% OFF", "Onboarding Express Pós-Venda".
- [x] Simulador de execução ao vivo com escolha de lead, ramificação e histórico de auditoria/logs em tempo real.
