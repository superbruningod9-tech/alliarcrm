# AGENTS

## Regras Obrigatórias para Todas as Tarefas do AlliarCRM

1. **Uso de Dados Reais** – Nunca criar dados mockados, fictícios ou placeholders. Todos os dados utilizados nas funcionalidades, testes ou demonstrações **devem** ser obtidos diretamente do Supabase (ou de APIs públicas que retornem dados reais).

2. **Prioridade a APIs Gratuitas** – Sempre priorizar o uso de APIs públicas gratuitas (ex.: BrasilAPI, OpenStreetMap) e APIs nativas do navegador (Web Audio API, Web Speech API, MediaRecorder) antes de sugerir ou integrar serviços pagos ou de terceiros que requeiram chave/assinatura paga.

3. **Validação de Build e Tipos** – Antes de concluir qualquer alteração, execute `npm run build` e valide o projeto com o compilador TypeScript (`tsc --noEmit`). Qualquer erro de compilação ou tipagem deve ser corrigido antes de avançar.

4. **Feedback Imediato ao Usuário** – Ao finalizar qualquer alteração visual ou funcional, inicie (ou mantenha ativo) o servidor de desenvolvimento local com `npm run dev` e abra/atualize a visualização no navegador integrado ou local (`http://localhost:<porta>` – normalmente `http://localhost:5173` ou a porta ativa do Vite). A rota modificada deve ser carregada para que o usuário veja as mudanças imediatamente.
