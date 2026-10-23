# ADR-0007: Tratamento de segredos no cliente web

## Context

A interface web exibe e manipula a senha de contas de terceiros guardadas no cofre (`keytography-009` em diante: cofre, avaliação, geração, troca de senha, supervisão do Admin). O backend decifra a senha e a devolve em texto no detalhe, no histórico e nas respostas de criar e editar ([ADR-0001](./ADR-0001-vault-encryption-and-recovery.md)); o servidor só mantém a DEK em memória por sessão ([ADR-0002](./ADR-0002-dek-session-cache.md), [ADR-0006](./ADR-0006-backend-managed-sessions.md)). A segurança do cofre, portanto, também depende do que o cliente faz com o segredo depois de recebê-lo: cache, tela, clipboard, formulários e logs. Essas regras atravessam vários planos e capabilities, e uma decisão por tela produziria políticas diferentes para o mesmo dado.

## Decision

1. **O segredo só vive na memória da aba.** A senha (detalhe, histórico, formulário, resposta de mutação) nunca vai para `localStorage`, `sessionStorage`, URL, título da página nem `console.*`. Rascunhos de formulário não são persistidos.
2. **Consultas que trazem senha não ficam em cache.** Detalhe, edição e histórico usam `gcTime: 0` (saem da memória assim que a tela é deixada) e são sempre buscados na hora; **a edição tem consulta própria** (chave distinta da do detalhe), para o formulário nunca nascer com o dado em cache do detalhe, e um refetch que falha não troca a tela por um erro (os dados digitados não se perdem). As listas (título, login, data) não têm segredo e usam o cache normal. As mutações também usam `gcTime: 0` e **devolvem só o `id`**: a resposta do servidor, que traz a senha, é descartada na camada de acesso e nunca vai para `setQueryData` nem para o cache de mutações.
3. **Fim de sessão, troca de conta e saída da tela limpam tudo.** Valores revelados voltam a ocultos, formulários e diálogos são descartados, e o cache de consultas é esvaziado ou redefinido pelo `SessionController` ([ADR-0006](./ADR-0006-backend-managed-sessions.md), item 13).
4. **Revelar é temporário.** A senha vem oculta; revelada, volta a ocultar em **30 segundos**, quando a aba fica oculta e ao sair da tela. Cada segredo tem o seu estado (revelar uma senha do histórico não revela as outras).
5. **Clipboard (melhor esforço).** Copiar um segredo agenda a limpeza em **cerca de 20 segundos**: com a página em foco, lê o clipboard (por no máximo **2 segundos**) e só o limpa se ainda tiver o conteúdo copiado (se a leitura for negada, indisponível ou ficar pendente, por exemplo num prompt de permissão, limpa assim mesmo); sem foco (o navegador recusa escrever), a limpeza fica pendente e roda **uma vez** quando a janela volta a ter foco; copiar de novo substitui a pendente (só a cópia mais recente que terminou agenda a limpeza, enquanto ela ainda está pendente); logout, expiração e troca de conta limpam a pendente (na hora, se a janela tem foco; senão, assim que ela volta a ter foco), e uma cópia que ainda estava sendo escrita é apagada assim que a escrita termina (se a janela está sem foco, a tentativa pode ser recusada e o valor ficar; a interface não avisa "indisponível" nesse caso, porque a sessão acabou). Clipboard indisponível (contexto não seguro, permissão negada) mostra mensagem clara; a única falha sem aviso é a recusa de apagar uma cópia cancelada pelo fim da sessão sem foco.
6. **Formulários não disparam o gerenciador de senhas do navegador.** O campo de senha de uma entrada usa `autocomplete="new-password"` (o valor que os navegadores respeitam; `off` é ignorado em campos de senha) e os demais campos `autocomplete="off"`: a senha de uma entrada não é uma credencial do próprio Keytography.
7. **Renderização segura.** Valores do usuário (título, login, campos adicionais) saem como texto: nada de `dangerouslySetInnerHTML` e nenhum link automático.
8. **Mutações não são reenviadas pela interface** (um envio por vez; os botões ficam desabilitados durante o envio e o handler ignora um segundo disparo); a repetição automática do cliente só ocorre depois de um 401, quando a chamada não foi processada ([ADR-0006](./ADR-0006-backend-managed-sessions.md)). Uma chamada recusada pelo cliente por troca de conta nunca é exibida como sucesso, e uma que o cliente não completou sem encerrar a sessão nem trocar a conta (conta ainda por conferir, refresh sem resposta) avisa que nada foi feito. **Ações reversíveis que tiram algo da vista (mover para a lixeira) pedem confirmação direta; as irreversíveis (exclusão definitiva) pedem a palavra digitada.**

## Consequences

- Todo plano de interface que exibe um segredo segue estas regras; os testes de cada tela provam as invariantes por mutação (`Verification Matrix` do plano).
- **Limitações aceitas:**
  - A limpeza do clipboard é melhor esforço: com a leitura negada, indisponível ou pendente por mais de 2 s ela não confere o conteúdo e pode sobrescrever uma cópia feita pelo usuário; sem foco só roda quando a janela volta a ter foco, **sem limite de tempo** (se a leitura também for negada, pode apagar uma cópia feita horas depois em outro aplicativo); Firefox e Safari tendem a recusar a escrita sem gesto do usuário, então a promessa de "cerca de 20 s" só vale de fato em navegadores baseados em Chromium (não verificado em navegador real); fechar a aba antes da limpeza deixa o valor no clipboard, e outros aplicativos podem lê-lo nesse intervalo.
  - A senha revelada fica visível por até 30 s, e o valor da senha está no atributo `value` do campo mesmo oculta (visível em "copiar como HTML" e a extensões do navegador).
  - Só a senha é cifrada no backend ([ADR-0001](./ADR-0001-vault-encryption-and-recovery.md)); título, login e campos adicionais ficam em texto no banco, e a interface não avisa sobre isso (decisão do usuário: a senha é o dado sensível).
  - Rascunhos de formulário não sobrevivem ao fim da sessão (deliberado).
  - Em Chromium, a leitura do clipboard na hora da limpeza (cerca de 20 s depois de copiar) pode disparar um pedido de permissão em um momento inesperado; sem resposta, conta como negada depois de 2 s. Não verificado em navegador real.
  - Se duas cópias seguidas terminam fora de ordem e o navegador deixa o valor da mais velha no clipboard, a limpeza da mais nova (que confere o conteúdo) não o apaga; exige uma escrita demorando mais de 20 s e não foi observado em navegador real.
  - Uma resposta de rede perdida ao criar uma entrada pode duplicá-la (a interface não repete a chamada, mas a pessoa pode tentar de novo), e uma resposta perdida ao mover para a lixeira deixa a lista desatualizada até a próxima carga.
- Mudar o valor do auto-ocultar (30 s) ou da limpeza do clipboard (20 s) é uma decisão de produto registrada aqui, com testes que fixam os valores.

## Alternatives Considered

- **Guardar a senha no cache de consultas com o `gcTime` padrão (5 minutos):** rejeitado: a senha ficaria em memória, fora da tela, por minutos depois de ser exibida.
- **Persistir rascunhos de formulário em `sessionStorage`:** rejeitado: guardaria a senha digitada fora da memória.
- **Limpar o clipboard sem ler antes:** rejeitado como padrão: apagaria uma cópia feita pelo usuário; só é usado quando a leitura é negada, para não deixar o segredo para trás.
- **Não limpar o clipboard:** rejeitado: o segredo ficaria à disposição de qualquer aplicativo indefinidamente.
- **`autocomplete="off"` na senha do formulário:** rejeitado: os navegadores o ignoram em campos de senha; `new-password` é o valor suportado para não preencher nem oferecer salvar.

## Canonical Links

- [docs/decisions/ADR-0001-vault-encryption-and-recovery.md](./ADR-0001-vault-encryption-and-recovery.md)
- [docs/decisions/ADR-0002-dek-session-cache.md](./ADR-0002-dek-session-cache.md)
- [docs/decisions/ADR-0006-backend-managed-sessions.md](./ADR-0006-backend-managed-sessions.md)
- [docs/guides/web-frontend-conventions.md](../guides/web-frontend-conventions.md)
