# Convenções de código da interface

## Purpose

Padrão de código, estilo e organização para **toda implementação de interface** do Keytography. Nasceu com a interface web (`web/`, `keytography-007`), mas vale como regra geral do projeto: interfaces futuras (inclusive Mobile/Desktop) devem seguir os mesmos princípios de reuso e de tokens, adaptando só o que a plataforma exigir.

A meta é consistência e reuso — componentes, classes, variáveis e animações definidos **uma vez** e reaproveitados, sem excesso de configuração, sem CSS inline e sem ajustes pontuais espalhados.

## Stack da interface web

React 19 + TypeScript (modo `strict`) + Vite, Tailwind CSS v4, componentes no estilo shadcn/ui (Radix UI + `class-variance-authority`), TanStack Query (dados da API), React Router, Zustand (estado de UI leve), `react-i18next`, Vitest + React Testing Library. Escolha e alternativas descartadas: ver [PROJECT-ARCHITECTURE.md](../PROJECT-ARCHITECTURE.md#selected-technology-direction).

### Dependências: só entram no plano que as usa

Não instalamos biblioteca "para o futuro". Cada uma entra no plano cujo código a consome, para evitar conflitos, peso extra e configuração ociosa. React Hook Form + Zod (com `@hookform/resolvers`) entraram em `keytography-008`, com as telas de autenticação; as demais ainda aguardam:

| Biblioteca | Entra em |
| --- | --- |
| Motion (animações de transição), `@formkit/auto-animate` (listas), `cmdk` (command palette) | `keytography-014` (ou antes, se um plano anterior realmente precisar) |

## Estrutura de pastas (`web/src`)

```
api/          cliente tipado (openapi-fetch) e schema.d.ts GERADO — nunca editar à mão
app/          providers globais e roteador
components/
  ui/         primitivos reutilizáveis (Button, Badge, Card, Sheet...) — agnósticos de domínio
  layout/     casca da aplicação (AppShell, navegação, marca)
features/     uma pasta por área funcional (health/, theme/, ... auth/, vault/ nos próximos planos)
i18n/         configuração e arquivos de tradução (locales/pt-BR.json)
lib/          utilitários puros (cn, ...)
styles/       index.css — Tailwind + tokens de design
test/         setup global dos testes
```

Regra de dependência: `features/*` pode usar `components/*`, `lib/*`, `api/*`; `components/ui` nunca importa de `features/*`.

## Nomenclatura

- Componentes React: `PascalCase.tsx`, um componente principal por arquivo, nome do arquivo = nome do componente.
- Hooks, stores, utilitários e módulos sem componente: `kebab-case.ts` (`use-health.ts`, `theme-store.ts`).
- Testes ficam ao lado do código: `Nome.test.tsx` / `nome.test.ts`.
- Atributos de tema/destaque e chaves persistidas usam `kebab-case` (`light-high-contrast`, `light-blue`).
- Chaves de tradução em `camelCase`, agrupadas por área (`nav.openMenu`, `health.status.healthy`).

## Estilo: tokens, nunca valores soltos

1. **Só utilitários semânticos.** Componentes usam `bg-background`, `text-foreground`, `bg-surface`, `border-border`, `text-muted-foreground`, `bg-primary`/`text-primary-foreground`, `bg-destructive`... Nunca `bg-white`, `text-gray-700`, hex ou `oklch()` dentro de componentes.
2. **Sem variantes `dark:`.** O tema troca os valores dos tokens (`data-theme` no `<html>`); o componente não sabe qual tema está ativo.
3. **Sem CSS inline** (`style={{...}}`) nem arquivos de CSS por componente para ajustes pontuais. Se um padrão se repete, vira variante do componente. Única exceção aceita: injetar variáveis CSS que uma biblioteca de terceiros só expõe via `style` (ex.: `sonner`, em `components/ui/sonner.tsx`), apontando para os tokens.
4. **Variantes tipadas com `cva`.** Um componente com aparências diferentes expõe `variant`/`size` (ver `components/ui/button.tsx`), em vez de receber `className` ad hoc em cada uso.
5. **`cn()`** (`lib/utils.ts`) para combinar classes condicionais; a última classe vence conflitos do Tailwind.
6. **Valores de design novos entram como token** em `styles/index.css` (cor, raio, animação), não como número mágico no componente.
7. **Responsividade mobile-first.** Estilo base = telas pequenas; `md:`/`lg:` ampliam. Sem largura fixa em pixels para layout.
8. **Respeitar as preferências do usuário** sempre: tema, cor de destaque, densidade de exibição (quando existir) e `prefers-reduced-motion` (já tratado globalmente em `index.css`).

## Temas e cores de destaque

Duas dimensões independentes aplicadas como atributos no `<html>`:

- `data-theme`: `light` (creme), `light-high-contrast` (branco), `dark` (cinza), `dark-high-contrast` (preto). A preferência `system` não é um atributo: é resolvida para `light`/`dark` conforme `prefers-color-scheme` (`features/theme`).
- `data-accent`: `green` (padrão), `lime`, `purple`, `red`, `blue`, `light-blue`, `orange`, `yellow`, `pink`.

### Como usar o destaque (três tokens, três papéis)

| Papel | Token / utilitário | Exemplo |
| --- | --- | --- |
| **Preenchimento** (botão principal, item ativo) | `bg-primary` + `text-primary-foreground` | `Button` default, item ativo da navegação |
| **Traço sobre o fundo** (ícone, anel de foco, borda de realce, texto grande de destaque) | `text-accent-ink`, `ring`/`outline-ring` | ícones da marca, foco global |
| **Qualquer outra coisa** | **não use o destaque** — use `foreground`, `muted-foreground`, `border` | texto corrido, rótulos |

Por que dois tokens para "o mesmo" destaque: o tom escolhido pelo usuário funciona bem como *preenchimento*, mas alguns (amarelo, limão, azul-claro, verde, laranja, rosa) ficam quase invisíveis como *traço* sobre fundos claros. `--accent-ink` é o **mesmo destaque** (mesmo matiz e croma) com a luminosidade limitada por tema (`--ink-max-l`: 0.58 no claro/creme, 0.55 no claro de alto contraste, sem limite nos escuros), então nunca some contra o fundo. **Não use `text-primary`** para ícones/texto sobre o fundo.

### Contraste: números e guarda automática

Medições (cálculo a partir dos tokens e conferência no navegador, nas 36 combinações tema × destaque):

- texto sobre o destaque (`primary-foreground`, cor escolhida pela luminosidade do destaque; limiar OKLCH `L = 0.6`, onde preto e branco têm o mesmo contraste): **≥ 5.14:1** (WCAG AA exige 4.5:1);
- destaque como traço (`accent-ink`, foco e ícones) contra `--background` e `--surface`: **≥ 3.4:1** medido no navegador (WCAG 1.4.11 exige 3:1) — antes do `accent-ink` o pior caso era 1.2:1 (amarelo sobre creme);
- texto e texto secundário sobre fundo/superfície: ≥ 5.5:1 em todos os temas (alto contraste chega a AAA).

Observação: nos temas claros/escuros comuns, o `accent-ink` serve para ícones, foco e texto **grande**; texto pequeno em destaque exigiria 4.5:1 (só os dois temas de alto contraste chegam lá). Bordas de campos de formulário nos temas comuns (`--border`) são decorativas e ficam abaixo de 3:1 — revisar na passada de acessibilidade de `keytography-014`.

**Guarda:** `src/styles/contrast.test.ts` lê os valores reais de `styles/index.css` e falha se qualquer uma dessas garantias regredir (um destaque, tema ou limite alterado sem conferir contraste). Ao adicionar um destaque ou tema novo, o teste já o cobre se ele seguir o mesmo formato de tokens; o que o CSS calcula só em runtime (gamut/mapeamento) continua pedindo uma conferência visual no navegador, registrada no PR.

A preferência é persistida em `localStorage` (`keytography.appearance`); `index.html` aplica o valor salvo antes do React montar, para não piscar o tema padrão. Se mudar a chave ou o formato, atualize os dois lados.

## Internacionalização

- **Todo texto visível** passa por `useTranslation()` / `t('area.chave')` — nunca string literal no JSX (inclusive `aria-label`, `title`, mensagens de erro e toasts).
- As chaves são tipadas a partir de `i18n/locales/pt-BR.json` (`i18n/i18next.d.ts`): chave inexistente é erro de compilação.
- Hoje só existe `pt-BR`. Inglês e espanhol entram depois da consolidação da interface web (ver [web-interface](../capabilities/web-interface/README.md)); adicioná-los = novo arquivo em `locales/` + registro em `i18n/index.ts`.

## Dados da API

- Toda chamada passa pelo cliente tipado (`api/client.ts`), gerado do contrato [`docs/reference/openapi.json`](../reference/openapi.json). Não escreva `fetch` manual nem tipos de DTO à mão.
- **Mudou um endpoint, DTO ou metadado de resposta na API? Regenerar e commitar o contrato e os tipos na mesma entrega é obrigatório** (procedimento em [docs/reference/README.md](../reference/README.md); decisão em [ADR-0004](../decisions/ADR-0004-versioned-openapi-contract.md)). O teste do backend e o CI do frontend falham se `docs/reference/openapi.json` ou `schema.d.ts` ficarem desatualizados — e um plano que toque a API deve listar o contrato em `Documentation Updates`.
- Leitura de dados via TanStack Query (cache, loading e erro tratados de forma uniforme).

## Formulários

- React Hook Form + Zod, com `zodResolver`. O schema vive em uma função que recebe `t` (`loginSchema(t)`, em `features/auth/auth-schemas.ts`), para que as mensagens de validação saiam do arquivo de tradução; o formulário o memoiza com `useMemo(() => schema(t), [t])`.
- O schema **espelha as regras da API** (por exemplo, senha ≥ 8 caracteres), mas a API continua sendo a autoridade: falhas vindas dela são mapeadas por tipo (`AuthFailure`) para um texto traduzido, nunca exibindo a mensagem crua do servidor.
- Use `FormField` (rótulo + controle + erro ligados por ARIA) com `Input`, e `Alert` para erros do formulário como um todo. Campos de senha usam `autoComplete` correto (`current-password`/`new-password`).

## Sessão e rotas protegidas

A sessão é gerenciada pela API ([ADR-0006](../decisions/ADR-0006-backend-managed-sessions.md)); o cliente só guarda o access token, **em memória**.

- O access token (e o usuário carregado) vive em `features/auth/session-store.ts`, **sem persistência**: nunca vá para `localStorage`/`sessionStorage`, nem para estado de componente ou URL. O refresh token é um cookie `HttpOnly` que o script não enxerga.
- O ciclo de vida (restauração por refresh ao abrir a aplicação, renovação com **uma única chamada em andamento por aba**, descarte da resposta de um refresh que chega depois do fim da sessão, verificação de troca de conta, logout real) fica em `features/auth/session.ts`; `SessionController` o aciona (restauração, renovação antes do vencimento, limpeza do cache). Não chame `/auth/refresh`, `/auth/logout` nem `/auth/logout-all` fora desse módulo (`logoutAllSessions()` é o "sair de todos os dispositivos").
- Quem precisa estar logado fica sob a rota `RequireAuth` (`features/auth/guards.tsx`, que espera a restauração da sessão antes de decidir e, no vencimento do token, espera um refresh em andamento antes de encerrar a sessão); telas só para visitantes ficam sob `GuestOnly`. Rotas novas entram em `app/routes.tsx`.
- Chamadas à API usam sempre o cliente tipado (`api/client.ts`): ele anexa o `Authorization`, renova o token se estiver para vencer e, ao receber 401, renova a sessão e **repete a chamada uma vez**; um 401 que persiste encerra a sessão (sem laço). Não monte o cabeçalho à mão, e não trate 401 nas telas. Endpoints anônimos (e o refresh) ficam na lista `PUBLIC_PATHS`; um endpoint anônimo novo entra nela. As chamadas que usam o cookie de refresh (`login`, `refresh`, `logout`) passam `credentials: 'include'` (web e API são origens diferentes).
- O usuário da sessão vem de `useCurrentUser()` (carregado sob demanda do store, e conferido a cada renovação). Consultas ao TanStack Query **não** incluem o token na chave: o `SessionController` esvazia o cache quando a sessão termina ou a **conta muda**, e só então — renovar o token da mesma conta não limpa nada.
- Depois do login, `loginRedirectTarget` (`features/auth/redirect.ts`) devolve o destino guardado pelo `RequireAuth`, só se for um caminho interno.

## Testes

- Vitest + React Testing Library. Consultar elementos **por papel e nome acessível** (`getByRole('button', { name })`), usando os textos do `pt-BR.json` (não duplique strings no teste).
- Mockar a rede com `vi.stubGlobal('fetch', ...)`; nunca depender de API rodando. Para fluxos com rotas e API, use os auxiliares de `src/test/` — `renderRoutes` (`render.tsx`; por padrão a aba já restaurou a sessão, `{ restored: false }` testa a restauração), `stubApi` por rota, `signInForTest` e `REFRESHED` (`api-stub.ts`) — e renderize a árvore real de `app/routes.tsx`. O `setup.ts` reinicia o store da sessão, os avisos e o estado de módulo (chamadas em voo) a cada teste.
- Comportamento visual que depende de CSS real (contraste, breakpoints, animações) não roda no jsdom — é verificado manualmente no navegador e registrado no PR.

## Acessibilidade mínima

Elementos interativos com nome acessível (`aria-label` traduzido quando só há ícone), navegação por teclado funcional, foco visível (anel global em `index.css` usando `--ring` = `accent-ink`, com contraste ≥ 3:1 garantido pela guarda de contraste), ícones decorativos com `aria-hidden`, e primitivos do Radix para diálogo/drawer (foco preso, `Esc`, ARIA).

## Notas de manutenção

- `openapi-typescript` ainda declara `typescript@^5` como peer; o `package.json` tem um `overrides` escopado a esse pacote apontando para o TypeScript do projeto (a saída gerada é só um `.d.ts`, validado pelo `tsc`). Remover o override quando o pacote suportar TypeScript 6.
- O linter é o `oxlint` (padrão do template do Vite); formatação com Prettier (`npm run format`).
