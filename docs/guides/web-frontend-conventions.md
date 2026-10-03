# Convenções de código da interface

## Purpose

Padrão de código, estilo e organização para **toda implementação de interface** do Keytography. Nasceu com a interface web (`web/`, `keytography-007`), mas vale como regra geral do projeto: interfaces futuras (inclusive Mobile/Desktop) devem seguir os mesmos princípios de reuso e de tokens, adaptando só o que a plataforma exigir.

A meta é consistência e reuso — componentes, classes, variáveis e animações definidos **uma vez** e reaproveitados, sem excesso de configuração, sem CSS inline e sem ajustes pontuais espalhados.

## Stack da interface web

React 19 + TypeScript (modo `strict`) + Vite, Tailwind CSS v4, componentes no estilo shadcn/ui (Radix UI + `class-variance-authority`), TanStack Query (dados da API), React Router, Zustand (estado de UI leve), `react-i18next`, Vitest + React Testing Library. Escolha e alternativas descartadas: ver [PROJECT-ARCHITECTURE.md](../PROJECT-ARCHITECTURE.md#selected-technology-direction).

### Dependências: só entram no plano que as usa

Não instalamos biblioteca "para o futuro". Cada uma entra no plano cujo código a consome, para evitar conflitos, peso extra e configuração ociosa:

| Biblioteca | Entra em |
| --- | --- |
| React Hook Form + Zod (formulários/validação) | `keytography-008` |
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

A cor do texto sobre o destaque (`--primary-foreground`) é calculada pela luminosidade do destaque (limiar OKLCH `L = 0.6`, onde preto e branco têm o mesmo contraste) — nunca fixada à mão. Medido no navegador nas 36 combinações tema × destaque: contraste mínimo 5.14:1 (WCAG AA exige 4.5:1). Ao adicionar um destaque ou tema novo, **meça de novo** (texto base, texto secundário e texto sobre destaque).

A preferência é persistida em `localStorage` (`keytography.appearance`); `index.html` aplica o valor salvo antes do React montar, para não piscar o tema padrão. Se mudar a chave ou o formato, atualize os dois lados.

## Internacionalização

- **Todo texto visível** passa por `useTranslation()` / `t('area.chave')` — nunca string literal no JSX (inclusive `aria-label`, `title`, mensagens de erro e toasts).
- As chaves são tipadas a partir de `i18n/locales/pt-BR.json` (`i18n/i18next.d.ts`): chave inexistente é erro de compilação.
- Hoje só existe `pt-BR`. Inglês e espanhol entram depois da consolidação da interface web (ver [web-interface](../capabilities/web-interface/README.md)); adicioná-los = novo arquivo em `locales/` + registro em `i18n/index.ts`.

## Dados da API

- Toda chamada passa pelo cliente tipado (`api/client.ts`), gerado do contrato [`docs/reference/openapi.json`](../reference/openapi.json). Não escreva `fetch` manual nem tipos de DTO à mão.
- Mudou um endpoint/DTO na API? Regenerar o contrato e os tipos: ver [docs/reference/README.md](../reference/README.md). O CI falha se o contrato versionado ou `schema.d.ts` ficarem desatualizados.
- Leitura de dados via TanStack Query (cache, loading e erro tratados de forma uniforme).

## Testes

- Vitest + React Testing Library. Consultar elementos **por papel e nome acessível** (`getByRole('button', { name })`), usando os textos do `pt-BR.json` (não duplique strings no teste).
- Mockar a rede com `vi.stubGlobal('fetch', ...)`; nunca depender de API rodando.
- Comportamento visual que depende de CSS real (contraste, breakpoints, animações) não roda no jsdom — é verificado manualmente no navegador e registrado no PR.

## Acessibilidade mínima

Elementos interativos com nome acessível (`aria-label` traduzido quando só há ícone), navegação por teclado funcional, foco visível (estilo global em `index.css`), ícones decorativos com `aria-hidden`, e primitivos do Radix para diálogo/drawer (foco preso, `Esc`, ARIA).

## Notas de manutenção

- `openapi-typescript` ainda declara `typescript@^5` como peer; o `package.json` tem um `overrides` escopado a esse pacote apontando para o TypeScript do projeto (a saída gerada é só um `.d.ts`, validado pelo `tsc`). Remover o override quando o pacote suportar TypeScript 6.
- O linter é o `oxlint` (padrão do template do Vite); formatação com Prettier (`npm run format`).
