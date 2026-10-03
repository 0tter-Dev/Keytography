// Testes dos hooks do projeto. Rode com: node --test .claude/hooks
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

function runHook(file, event, env = {}) {
  return spawnSync('node', [join(dir, file)], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('bloqueia encerrar processo pelo nome da imagem', () => {
  const blocked = [
    'taskkill /F /IM node.exe',
    'taskkill /im dotnet.exe /f',
    'pkill node',
    'killall -9 node',
    'Stop-Process -Name node -Force',
    'Get-Process node | Stop-Process -Force',
    'Get-Process -Name dotnet | Stop-Process',
  ];
  for (const command of blocked) {
    const result = runHook('block-process-kill-by-name.mjs', bash(command));
    assert.equal(result.status, 2, `deveria bloquear: ${command}`);
    assert.match(result.stderr, /Get-NetTCPConnection/);
  }
});

test('permite encerrar por PID ou pela porta', () => {
  const allowed = [
    'taskkill /PID 1234 /F',
    'Stop-Process -Id 1234',
    'Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }',
    'Get-Process -Id 1234 | Stop-Process',
    'dotnet test',
    'git status',
  ];
  for (const command of allowed) {
    const result = runHook('block-process-kill-by-name.mjs', bash(command));
    assert.equal(result.status, 0, `deveria permitir: ${command}`);
  }
});

test('não bloqueia texto que apenas menciona o comando (heredoc, aspas, mensagem de commit)', () => {
  const allowed = [
    "git commit -m 'docs: bloqueia taskkill /IM e pkill'",
    'git commit -m "nunca use Stop-Process -Name node"',
    "cat > doc.md <<'EOF'\nNão use taskkill /IM node.exe.\nTambém não use pkill.\nEOF",
    'echo "taskkill /F /IM node.exe" > nota.txt',
  ];
  for (const command of allowed) {
    const result = runHook('block-process-kill-by-name.mjs', bash(command));
    assert.equal(result.status, 0, `deveria permitir: ${command}`);
  }
});

test('bloqueia o comando embrulhado em outro shell', () => {
  const blocked = [
    'powershell -Command "taskkill /F /IM node.exe"',
    "bash -c 'pkill node'",
    'cmd /c taskkill /IM dotnet.exe /F',
  ];
  for (const command of blocked) {
    const result = runHook('block-process-kill-by-name.mjs', bash(command));
    assert.equal(result.status, 2, `deveria bloquear: ${command}`);
  }
});

test('entrada inválida nunca bloqueia', () => {
  const result = spawnSync('node', [join(dir, 'block-process-kill-by-name.mjs')], { input: 'não é json', encoding: 'utf8' });
  assert.equal(result.status, 0);
});

test('lembra do contrato ao editar a superfície da API', () => {
  const touched = [
    'E:\\Programacao\\Projetos\\Keytography\\src\\Keytography.Api\\Vault\\VaultEndpoints.cs',
    'E:\\Programacao\\Projetos\\Keytography\\src\\Keytography.Api\\Auth\\AuthDtos.cs',
    'E:\\Programacao\\Projetos\\Keytography\\src\\Keytography.Api\\Program.cs',
    '/repo/src/Keytography.Api/OpenApi/NumericSchemaTransformer.cs',
  ];
  for (const file_path of touched) {
    const result = runHook('remind-api-contract.mjs', { tool_name: 'Edit', tool_input: { file_path } });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ADR-0004/, `deveria lembrar: ${file_path}`);
  }
});

test('não lembra do contrato para outros arquivos', () => {
  const untouched = [
    'E:\\Programacao\\Projetos\\Keytography\\src\\Keytography.Api\\Vault\\VaultCrypto.cs',
    'E:\\Programacao\\Projetos\\Keytography\\web\\src\\App.tsx',
    'E:\\Programacao\\Projetos\\Keytography\\README.md',
  ];
  for (const file_path of untouched) {
    const result = runHook('remind-api-contract.mjs', { tool_name: 'Edit', tool_input: { file_path } });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '', `não deveria lembrar: ${file_path}`);
  }
});

test('o pré-commit do web só reage a git commit', () => {
  const result = runHook('web-precommit-checks.mjs', bash('git status'), { CLAUDE_PROJECT_DIR: dir });
  assert.equal(result.status, 0);
});
