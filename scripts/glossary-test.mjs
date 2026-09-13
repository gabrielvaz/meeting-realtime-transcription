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
  // Empresas e produtos
  { input: "Usamos o cardio line na clínica.", expect: "Cardioline" },
  { input: "A cardius fabrica o aparelho.", expect: "Cardios" },
  { input: "O vireo arc é a nova plataforma.", expect: "Vireo ARK" },
  { input: "Abra o web app para ver o laudo.", expect: "WebApp" },
  { input: "O ecg web app sincroniza sozinho.", expect: "ECGWebApp" },
  { input: "Instalamos o touch ecg na máquina.", expect: "touchECG" },
  { input: "O click holter exporta o exame.", expect: "Clickholter" },
  { input: "Rodamos o cube stress no teste.", expect: "CubeStress" },
  { input: "O cardio light é o gravador novo.", expect: "CardioLight" },
  { input: "Pedimos dez unidades do walk 200.", expect: "Walk200" },
  { input: "O ecg 100 s está no estoque.", expect: "ECG100S" },
  { input: "O win cardio roda em Windows.", expect: "WinCardio" },
  { input: "O ergo pc faz o teste de esforço.", expect: "ErgoPC" },
  { input: "O modelo hd mais tem mais canais.", expect: "HD+" },

  // Clínicos
  { input: "O exame de holder ficou bom.", expect: "Holter" },
  { input: "O e c g mostrou alteração.", expect: "ECG" },
  { input: "Fizemos a expirometria também.", expect: "espirometria" },

  // Negócio
  { input: "O m r r cresceu 12% no trimestre.", expect: "MRR" },
  { input: "Projetamos o a r r para dezembro.", expect: "ARR" },
  { input: "O i c p mudou depois da pesquisa.", expect: "ICP" },
  { input: "É um negócio b two b.", expect: "B2B" },

  // Normalização de caixa
  { input: "Relatório do HOLDER anexado.", expect: "Holter" },
  { input: "cardio-line é a marca", expect: "Cardioline" },
  { input: "O cárdios com acento também casa.", expect: "Cardios" },

  // Negativos: o dicionário não pode estragar texto correto.
  // Uma variante ambígua faz mais estrago do que o erro que ela conserta.
  { input: "Holderman não deve virar Holterman.", expect: "Holderman" },
  { input: "Vamos voltar ao assunto principal.", expect: "voltar" },
  { input: "O eletrocardiograma do paciente está normal.", expect: "eletrocardiograma" },
  { input: "Preciso do eletro de ontem.", expect: "eletro" },
  { input: "O Holter já está certo.", expect: "Holter" },
  { input: "A espirometria já estava escrita certo.", expect: "espirometria" },

  // Trade-off assumido, não acerto: "holder" é palavra inglesa legítima, mas
  // é de longe o erro mais comum para "Holter" numa reunião em português.
  // Quem conduz reuniões em inglês deve remover essa variante.
  { input: "Ele é o holder do contrato.", expect: "Holter", tradeoff: true },
];

let failures = 0;
for (const { input, expect, tradeoff } of cases) {
  const output = applyGlossary(input, glossary);
  const ok = output.includes(expect);
  if (!ok) failures += 1;
  const label = ok ? (tradeoff ? "nota " : "ok   ") : "FALHA";
  console.log(`${label} ${JSON.stringify(output)}`);
}

if (failures) {
  console.error(`\n${failures} caso(s) falharam`);
  process.exit(1);
}
console.log(`\n${cases.length} casos passaram`);
