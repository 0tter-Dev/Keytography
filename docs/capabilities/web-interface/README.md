# Interface Web

## Purpose

Interface web do Keytography — a primeira interface de usuário do projeto, consumindo o core/backend já implementado (autenticação, cofre, avaliação e geração de senha). Serve deliberadamente como instância de teste/iteração: é aqui que identidade visual, responsividade, convenções de código de interface, animações, interações e experiência do usuário são definidas e evoluídas antes de qualquer portabilidade para mobile ou desktop (ver [PROJECT-ARCHITECTURE.md](../../PROJECT-ARCHITECTURE.md#architectural-direction)).

## Current Status

`in_progress` — fundação entregue em `keytography-007` (projeto `web/`, tooling, sistema de temas, i18n, cliente de API tipado, casca de layout responsiva, CI); ainda sem telas funcionais além de uma tela de estado do sistema. As telas de autenticação, cofre, avaliação, geração, configurações e supervisão do Admin vêm nos planos `008` a `013`, e o polimento final em `014`.

## Key Rules

- **Stack**: React + TypeScript + Vite (ver [PROJECT-ARCHITECTURE.md](../../PROJECT-ARCHITECTURE.md#selected-technology-direction) para a decisão e a alternativa descartada). Projeto em `web/` na raiz do repositório, toolchain Node/npm separado do backend .NET.
- **Convenções de código**: [web-frontend-conventions.md](../../guides/web-frontend-conventions.md) define componentização reutilizável, variantes tipadas (`cva`), tokens de design, proibição de CSS inline/ajustes pontuais, nomenclatura, i18n e testes — vale como padrão geral do projeto para toda interface futura, não só para esta capability. Bibliotecas só entram no plano que as usa (ver tabela no guia).
- **Dados da API**: todo acesso passa por um cliente tipado (`openapi-fetch`) gerado do contrato [`docs/reference/openapi.json`](../../reference/openapi.json), que a própria API produz; teste do backend e CI do frontend impedem que o contrato e os tipos fiquem desatualizados. A API libera CORS só para as origens configuradas (`Cors:AllowedOrigins`; padrão: servidor de desenvolvimento do Vite em `localhost:5173`).
- **Sistema de temas**: 5 temas (`system` — padrão inicial, segue `prefers-color-scheme` — `light`, `light-high-contrast`, `dark`, `dark-high-contrast`) × 9 cores de destaque (verde, verde-limão, roxo, vermelho, azul, azul-claro, laranja, amarelo, rosa), via CSS custom properties. A cor de texto sobre elementos de destaque é calculada pela luminosidade da cor escolhida, não fixa, para garantir contraste nos modos de alto contraste. Persistido em `localStorage` (sem backend) — sincronização entre dispositivos fica para quando sincronização em nuvem deixar de ser um Non-Goal. A infraestrutura (tokens, store, aplicação no `<html>`, anti-flash) existe desde `keytography-007`; um seletor temporário só aparece em desenvolvimento, e a UI definitiva de seleção chega em `keytography-012`. Contraste do texto sobre o destaque medido nas 36 combinações tema × destaque: mínimo 5.14:1 (WCAG AA = 4.5:1).
- **i18n**: sistema 100% `pt-BR` por agora, mas já estruturado via `react-i18next` desde `keytography-007` (um único arquivo de tradução) para que adicionar idiomas depois seja só tradução, não reescrita. `en` e `es` são planejados para depois da consolidação da interface web, antes de Mobile/Desktop começarem (ver [PROJECT-ARCHITECTURE.md](../../PROJECT-ARCHITECTURE.md#architectural-direction)).
- **Preferências de exibição**: densidade de listagem (Tabela/Lista/Cards/Blocos) e avatar gerado (iniciais do Login + cor de fundo escolhida entre as 9 cores de destaque) são preferências locais (`localStorage`), implementadas em `keytography-012`.
- **Casca de layout**: sidebar recolhível no desktop (`md+`) e barra superior com menu hambúrguer + drawer no mobile; itens de navegação sem tela ainda aparecem como placeholders desabilitados.
- **Supervisão do Admin**: a interface implementada nesta fase (`keytography-013`) cobre só o que o backend já expõe — leitura de cofre de outro usuário e recálculo retroativo de avaliação. Um painel mais completo é evolução futura (ver abaixo).

## Main Relationships

- depends on [authentication-and-users](../authentication-and-users/README.md): toda tela além de login/registro exige um usuário autenticado; também consome o endpoint de troca de senha autenticada (`keytography-012`).
- depends on [vault-entries](../vault-entries/README.md): consome os endpoints de CRUD de cofre.
- depends on [password-evaluation](../password-evaluation/README.md): exibe a nota de força e o detalhamento por critério já retornados pela API.
- depends on [password-generation](../password-generation/README.md): consome o endpoint de geração de senha.

## Future Considerations

Ideias discutidas e deliberadamente fora do escopo desta fase — registradas para não se perderem, não para implementação imediata:

- **Configurações de conta completas**: nome de exibição editável e upload de imagem de perfil real (hoje: avatar gerado por iniciais + cor, sem upload). Exige mudança de schema/armazenamento no backend.
- **Painel de Admin completo**: diretório/listagem de todos os usuários do sistema, e métricas/saúde agregada (além da supervisão de cofre já implementada). Exige endpoints novos no backend.
- **Cor de destaque customizada**: seletor de cor livre, além das 9 cores curadas atuais.
- **Organização de entradas de cofre**: tags, favoritos, e um esquema de grupos/subgrupos. Exige mudança de schema em `vault-entries`, fora do escopo de uma capability só de interface.
- **i18n além de `pt-BR`**: inglês e espanhol, planejados para depois da consolidação desta interface, antes de Mobile/Desktop.
