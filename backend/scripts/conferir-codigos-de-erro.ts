// Critério de pronto da D23: todo código de erro de docs/api.md aparece em algum teste.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const contrato = readFileSync(new URL('../../docs/api.md', import.meta.url), 'utf8');

function codigosDoContrato(texto: string): Set<string> {
  const codigos = new Set<string>();
  for (const linha of texto.split('\n')) {
    const aposStatus = /\*\*\d{3}\*\*\s+((?:`[A-Z_]+`\s*\/?\s*)+)/.exec(linha);
    const linhaDaTabela = /^\|\s*`([A-Z_]+)`\s*\|/.exec(linha);
    const emAspas = linha.matchAll(/codigo: "([A-Z_]+)"/g);
    if (aposStatus?.[1]) for (const [, codigo] of aposStatus[1].matchAll(/`([A-Z_]+)`/g)) codigos.add(codigo!);
    if (linhaDaTabela?.[1]) codigos.add(linhaDaTabela[1]);
    for (const [, codigo] of emAspas) codigos.add(codigo!);
  }
  return codigos;
}

function textoDosTestes(pasta: string): string {
  return readdirSync(pasta, { recursive: true, encoding: 'utf8' })
    .filter((arquivo) => arquivo.endsWith('.test.ts'))
    .map((arquivo) => readFileSync(join(pasta, arquivo), 'utf8'))
    .join('\n');
}

const codigos = [...codigosDoContrato(contrato)].sort();
const testes = textoDosTestes(fileURLToPath(new URL('../src', import.meta.url)));
const semTeste = codigos.filter((codigo) => !testes.includes(`'${codigo}'`));
if (semTeste.length > 0) {
  console.error(`Códigos de erro sem teste: ${semTeste.join(', ')}`);
  process.exit(1);
}
console.log(`Todo código de erro do api.md tem teste (${codigos.length} códigos).`);
