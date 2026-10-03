// Utilitários compartilhados pelos hooks do Claude Code deste projeto.
// Os hooks recebem o evento como JSON no stdin; qualquer falha de leitura vira "sem opinião" (exit 0),
// para que um hook com problema nunca trave o trabalho.

export function readEvent() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    process.stdin.on('error', () => resolve(null));
  });
}

/** Bloqueia a ação e devolve o motivo ao Claude (exit 2: stderr volta como feedback). */
export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

/** Acrescenta contexto à conversa depois de uma ação (PostToolUse). */
export function addContext(message) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message },
    }),
  );
}
