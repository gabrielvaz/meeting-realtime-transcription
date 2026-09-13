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
  { input: "O exame de Holder ficou bom.", expect: "Holter" },
  { input: "O e c g mostrou alteração.", expect: "ECG" },
  { input: "Fizemos a expirometria também.", expect: "espirometria" },

  // Negócio
  { input: "O m r r cresceu 12% no trimestre.", expect: "MRR" },
  { input: "Projetamos o a r r para dezembro.", expect: "ARR" },
  { input: "O i c p mudou depois da pesquisa.", expect: "ICP" },
  { input: "É um negócio b two b.", expect: "B2B" },

  // Erros observados em teste real, com voz humana e com TTS
  { input: "O nome Router não deve ser traduzido.", expect: "Holter" },
  { input: "the name Hotter shouldn't be translated", expect: "Holter" },
  { input: "Relatório do Holder anexado.", expect: "Holter" },
  { input: "presentazione della Card Online", expect: "Cardioline" },
  { input: "una apresentação da cardiolimne", expect: "Cardioline" },
  { input: "os nomes ACG e outras coisas", expect: "ECG" },
  { input: "o nome Alterna não deve ser traduzido", expect: "Holter" },
  { input: "il nome Alterna non deve essere tradotto", expect: "Holter" },

  // Normalização de caixa: a forma correta do termo é regra por si só
  { input: "apresentação da cardioline hoje", expect: "Cardioline" },
  { input: "This name, CardioLine, shouldn't change.", expect: "Cardioline" },
  { input: "o cardiolight novo", expect: "CardioLight" },
  { input: "rodamos no CUBESTRESS", expect: "CubeStress" },

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
  // Termo canônico minúsculo não pode perder a maiúscula de início de frase.
  { input: "Espirometria é o exame complementar.", expect: "Espirometria" },
  // Variante capitalizada não pode pegar a palavra comum em minúscula.
  { input: "O sistema alterna entre os canais.", expect: "alterna" },
  { input: "O roteador da sala caiu.", expect: "roteador" },

  // Palavras legítimas em minúscula ficam intactas: a variante correspondente
  // é capitalizada, e o modelo capitaliza o que entende como nome próprio.
  { input: "Ele é o holder do contrato.", expect: "holder" },
  { input: "It is getting hotter in here.", expect: "hotter" },
  { input: "Configure o router do escritório.", expect: "router" },
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
