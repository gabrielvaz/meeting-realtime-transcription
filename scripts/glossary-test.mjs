/**
 * Teste do dicionário de correção, sem browser.
 *
 * `lib/glossary.ts` não importa nada, então o Node roda o TypeScript direto:
 *
 *   node --experimental-strip-types scripts/glossary-test.mjs
 *
 * O caso que mais importa é o último: corrigir "holder" não pode estragar
 * "Holderman". É o tipo de erro que uma substituição ingênua introduz e que
 * ninguém percebe até aparecer no meio de uma reunião.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { compileGlossary, applyGlossary, DEFAULT_GLOSSARY } = await import(
  join(root, "lib/glossary.ts")
);

const glossary = compileGlossary(DEFAULT_GLOSSARY);

const cases = [
  { input: "O exame de holder ficou bom.", expect: "Holter" },
  { input: "Usamos o cardio line na clínica.", expect: "Cardioline" },
  { input: "O e c g mostrou alteração.", expect: "ECG" },
  { input: "A cardius fabrica o aparelho.", expect: "Cardios" },
  { input: "Relatório do HOLDER anexado.", expect: "Holter" },
  { input: "cardio-line é a marca", expect: "Cardioline" },
  { input: "O Holter já está certo.", expect: "Holter" },
  { input: "O cárdios com acento também casa.", expect: "Cardios" },
  // Negativo: a palavra maior não pode ser mutilada.
  { input: "Holderman não deve virar Holterman.", expect: "Holderman" },
];

let failures = 0;
for (const { input, expect } of cases) {
  const output = applyGlossary(input, glossary);
  const ok = output.includes(expect);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok   " : "FALHA"} ${JSON.stringify(output)}`);
}

if (failures) {
  console.error(`\n${failures} caso(s) falharam`);
  process.exit(1);
}
console.log(`\n${cases.length} casos passaram`);
