// PreToolUse (Bash|PowerShell): impede encerrar processos pelo NOME da imagem.
// Lição aprendida: `taskkill /IM node.exe` derruba todo processo com esse nome, inclusive os que não
// pertencem a este projeto. O correto é parar pelo processo que escuta a porta (ou pelo PID).
import { block, readEvent } from './lib.mjs';

const patterns = [
  { regex: /\btaskkill(\.exe)?\b[^\n|;&]*\s\/im\b/i, what: 'taskkill /IM' },
  { regex: /\b(pkill|killall)\b/i, what: 'pkill/killall' },
  { regex: /\bStop-Process\b[^\n|;&]*-Name\b/i, what: 'Stop-Process -Name' },
  { regex: /\bGet-Process\b(?![^\n|;&]*-Id\b)[^\n]*\|\s*Stop-Process\b/i, what: 'Get-Process <nome> | Stop-Process' },
];

// Quando o comando embrulha outro shell (`powershell -Command "..."`, `bash -c '...'`), o texto entre aspas
// É o comando de verdade e precisa ser analisado.
const shellWrapper = /\b(powershell|pwsh|cmd(\.exe)?|bash|sh|zsh|iex|Invoke-Expression)\b[^\n|;&]*\s(-c|-command|\/c)\b|\b(iex|Invoke-Expression)\b/i;

// Remove o que é texto e não comando: corpos de heredoc (`<<'EOF' ... EOF`) e strings entre aspas,
// para que mensagens de commit ou documentação que mencionam `taskkill /IM` não gerem falso positivo.
export function stripLiterals(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
}

export function check(command) {
  if (typeof command !== 'string') return null;
  const analyzed = shellWrapper.test(command) ? command : stripLiterals(command);
  return patterns.find(({ regex }) => regex.test(analyzed))?.what ?? null;
}

const isMain = process.argv[1]?.endsWith('block-process-kill-by-name.mjs');
if (isMain) {
  const event = await readEvent();
  const found = check(event?.tool_input?.command);
  if (found) {
    block(
      `Bloqueado (${found}): não encerre processos pelo nome da imagem; isso pode derrubar processos alheios ao projeto.\n` +
        'Pare pelo processo que escuta a porta, por exemplo (PowerShell):\n' +
        '  Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }\n' +
        'ou use o PID exato obtido de `Get-NetTCPConnection`/`Get-Process -Id`.',
    );
  }
}
