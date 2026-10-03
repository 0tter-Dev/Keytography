// PostToolUse (Edit|Write): lembra de regenerar o contrato quando a superfície da API muda.
// Regra: ADR-0004. O teste do backend e o CI do frontend já falham se isso for esquecido; este aviso
// só antecipa o erro para quem edita.
import { addContext, readEvent } from './lib.mjs';

const apiSurface = /[\\/]src[\\/]Keytography\.Api[\\/](.*[\\/])?(.*(Endpoints|Dtos)\.cs|Program\.cs|OpenApi[\\/].*\.cs)$/i;

export function touchesApiSurface(filePath) {
  return typeof filePath === 'string' && apiSurface.test(filePath);
}

const isMain = process.argv[1]?.endsWith('remind-api-contract.mjs');
if (isMain) {
  const event = await readEvent();
  if (touchesApiSurface(event?.tool_input?.file_path)) {
    addContext(
      'Você alterou a superfície da API. Se endpoint, DTO ou metadado de resposta mudou, regenere e comite o contrato na mesma entrega (ADR-0004): ' +
        '`KEYTOGRAPHY_UPDATE_OPENAPI=1 dotnet test` (PowerShell: `$env:KEYTOGRAPHY_UPDATE_OPENAPI = "1"; dotnet test`) e depois `npm run api:types` em `web/`. ' +
        'Detalhes em docs/reference/README.md.',
    );
  }
}
