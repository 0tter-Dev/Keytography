// PreToolUse (Bash|PowerShell): antes de um `git commit` com alterações em web/, roda lint e format:check.
// Mesmas verificações do job `web` do CI; falhar aqui evita um commit que o CI recusaria.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { block, readEvent } from './lib.mjs';

export function isGitCommit(command) {
  return typeof command === 'string' && /\bgit\s+(-[^\s]+\s+)*commit\b/.test(command);
}

// Comando em uma única string (sem array de argumentos): `npm` é `npm.cmd` no Windows e precisa de shell.
function run(cwd, commandLine) {
  return spawnSync(commandLine, { cwd, encoding: 'utf8', shell: true });
}

const isMain = process.argv[1]?.endsWith('web-precommit-checks.mjs');
if (isMain) {
  const event = await readEvent();
  if (isGitCommit(event?.tool_input?.command)) {
    const root = process.env.CLAUDE_PROJECT_DIR ?? event?.cwd ?? process.cwd();
    const webDir = join(root, 'web');

    // Considera staged, não staged e novos: o `git add` pode estar no mesmo comando do commit.
    const status = run(root, 'git status --porcelain -- web');
    const hasWebChanges = status.status === 0 && status.stdout.trim().length > 0;

    if (hasWebChanges && existsSync(join(webDir, 'node_modules'))) {
      for (const script of ['lint', 'format:check']) {
        const result = run(webDir, `npm run ${script}`);
        if (result.status !== 0) {
          const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n');
          block(
            `Commit bloqueado: \`npm run ${script}\` falhou em web/ (o job \`web\` do CI falharia igual).\n${output}\n` +
              'Corrija (para formatação: `npm run format` em web/) e tente o commit de novo.',
          );
        }
      }
    }
  }
}
