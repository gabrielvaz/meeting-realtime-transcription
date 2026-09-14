/**
 * Teste do modo apresentação.
 *
 * O que importa aqui é o isolamento: o HTML que o usuário envia precisa rodar
 * scripts (senão não há slide interativo) sem enxergar o `localStorage` desta
 * aplicação, onde mora a chave da OpenAI. O sandbox sem `allow-same-origin`
 * garante isso, e `scripts/sample-deck.html` tenta a leitura de propósito para
 * o teste poder afirmar que ela falhou.
 *
 *   APP_URL=http://localhost:3000 node scripts/presentation-test.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-152.0.7977.75/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? ".smoke";
const here = import.meta.dirname;

fs.mkdirSync(OUT, { recursive: true });
const speech = `data:audio/wav;base64,${fs.readFileSync(path.join(here, "source-speech.wav")).toString("base64")}`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: !process.env.HEADFUL,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1600,1000",
  ],
  defaultViewport: { width: 1600, height: 1000 },
});

const page = await browser.newPage();
await page.evaluateOnNewDocument((audioSrc) => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext({ sampleRate: 48000 });
    const el = new Audio(audioSrc);
    el.loop = true;
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaElementSource(el).connect(dest);
    await ctx.resume();
    await el.play();
    return dest.stream;
  };
}, speech);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(APP_URL, { waitUntil: "networkidle2" });

// --- Temas: cada um precisa ter as próprias cores ---
await page.click("button::-p-text(Configurar)");
await wait(500);
await page.click('[data-tab="appearance"]');
await wait(400);
const themes = {};
for (const id of ["light", "dark", "paper", "contrast", "amber"]) {
  await page.click(`[data-theme-option="${id}"]`);
  await wait(220);
  themes[id] = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return `${style.backgroundColor} / ${style.color}`;
  });
}
await page.click('[data-theme-option="light"]');
await wait(200);
await page.keyboard.press("Escape");
await wait(400);
console.log("temas", JSON.stringify(themes, null, 2));

await page.click('[data-mode="presentation"]');
await wait(300);

const input = await page.$("[data-deck-input]");
await input.uploadFile(path.join(here, "sample-deck.html"));
await wait(600);

const deckName = await page.evaluate(
  () => document.querySelector("[data-deck-name]")?.textContent ?? null,
);

await page.click('[data-lang="en"]');
await page.evaluate(() =>
  [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Iniciar"))?.click(),
);
await wait(15000);

const frame = page.frames().find((f) => f.url() === "about:srcdoc");
const leak = frame ? await frame.evaluate(() => window.__leak) : null;
const domain = frame ? await frame.evaluate(() => String(document.domain)) : null;

const slideBefore = frame
  ? await frame.evaluate(() => document.querySelector(".slide.on")?.dataset.i)
  : null;
await page.evaluate(() => document.querySelector("[data-deck-frame]")?.focus());
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await wait(400);
const slideAfter = frame
  ? await frame.evaluate(() => document.querySelector(".slide.on")?.dataset.i)
  : null;

// --- Layouts: a geometria tem de mudar de verdade ---
const layouts = {};
for (const id of ["bottom", "top", "right", "overlay", "hidden"]) {
  await page.click('[data-menu="layout"]');
  await wait(350);
  await page.click(`[data-layout-option="${id}"]`);
  await wait(250);
  await page.keyboard.press("Escape");
  await wait(450);
  layouts[id] = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      applied: document.querySelector("main[data-layout]")?.dataset.layout,
      band: rect("[data-caption-band]"),
      slides: rect("[data-deck-frame]"),
      captionPx: (() => {
        const c = document.querySelector(".caption");
        return c ? Math.round(parseFloat(getComputedStyle(c).fontSize)) : null;
      })(),
    };
  });
}
console.log("layouts", JSON.stringify(layouts, null, 2));

await page.click('[data-menu="layout"]');
await wait(350);
await page.click('[data-layout-option="bottom"]');
await wait(250);
await page.keyboard.press("Escape");
await wait(450);

// --- Arrastar a divisa entre slides e legendas ---
const geometry = () =>
  page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return { band: rect("[data-caption-band]"), slides: rect("[data-deck-frame]"), handle: rect("[data-split-handle]") };
  });

const setLayout = async (id) => {
  await page.click('[data-menu="layout"]');
  await wait(320);
  await page.click(`[data-layout-option="${id}"]`);
  await wait(200);
  await page.keyboard.press("Escape");
  await wait(450);
};

const drags = {};
for (const [id, dx, dy] of [["bottom", 0, -180], ["top", 0, 150], ["right", -260, 0], ["overlay", 0, -120]]) {
  await setLayout(id);
  const before = await geometry();
  const h = before.handle;
  if (!h) {
    drags[id] = { error: "sem divisor" };
    continue;
  }
  await page.mouse.move(h.x + h.w / 2, h.y + h.h / 2);
  await page.mouse.down();
  // Passos intermediários: um salto único não gera `pointermove` suficiente.
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(h.x + h.w / 2 + (dx * i) / 6, h.y + h.h / 2 + (dy * i) / 6);
    await wait(30);
  }
  await page.mouse.up();
  await wait(400);
  const after = await geometry();
  const dim = id === "right" ? "w" : "h";
  drags[id] = { before: before.band[dim], after: after.band[dim], slidesBefore: before.slides[dim], slidesAfter: after.slides[dim] };
}
const savedSizes = await page.evaluate(
  () => JSON.parse(localStorage.getItem("live-translation:preferences")).bandSize,
);
console.log("arrasto", JSON.stringify({ drags, savedSizes }, null, 2));

await setLayout("bottom");

const band = await page.evaluate(() => {
  const el = document.querySelector("[data-caption-band]");
  return {
    height: el ? Math.round(el.getBoundingClientRect().height) : null,
    text: [...(el?.querySelectorAll(".caption") ?? [])]
      .map((c) => c.textContent)
      .join(" ")
      .slice(0, 80),
  };
});

console.log(JSON.stringify({ deckName, leak, domain, slideBefore, slideAfter, band }, null, 2));
await page.screenshot({ path: `${OUT}/presentation.png` });

const failures = [];
if (deckName !== "sample-deck.html") failures.push("o arquivo não foi carregado");
if (!frame) failures.push("iframe dos slides não apareceu");
if (!String(leak).startsWith("BLOQUEADO")) {
  failures.push(`ISOLAMENTO QUEBRADO: o deck leu o localStorage (${leak})`);
}
if (domain) failures.push(`a origem do deck não é opaca (document.domain = ${domain})`);
if (slideBefore === slideAfter) failures.push("as setas não navegaram os slides");
if (!band.height) failures.push("faixa de legendas ausente");
if (!band.text) failures.push("legenda vazia durante a apresentação");

// Cada tema precisa de cores próprias. O bug que isto pega: `.dark` do shadcn
// tem a mesma especificidade dos blocos de tema e vence por ordem no arquivo,
// fazendo "âmbar" renderizar idêntico a "escuro".
const distinctThemes = new Set(Object.values(themes));
if (distinctThemes.size !== Object.keys(themes).length) {
  failures.push(`temas com cores repetidas: ${JSON.stringify(themes)}`);
}

// Arrastar tem de mexer na geometria e gravar, em todos os layouts.
for (const [id, result] of Object.entries(drags)) {
  if (result.error) {
    failures.push(`layout ${id}: ${result.error}`);
    continue;
  }
  if (Math.abs(result.after - result.before) < 40) {
    failures.push(`arrastar não redimensionou em ${id} (${result.before} → ${result.after})`);
  }
  // Sobreposta, a faixa cresce por cima: os slides não podem encolher.
  const slidesChanged = result.slidesBefore !== result.slidesAfter;
  if (id === "overlay" && slidesChanged) {
    failures.push("sobreposição encolheu os slides");
  }
  if (id !== "overlay" && !slidesChanged) {
    failures.push(`os slides não cederam espaço em ${id}`);
  }
}
for (const [id, size] of Object.entries(savedSizes)) {
  if (typeof size !== "number" || size <= 0) failures.push(`tamanho de ${id} não foi salvo`);
}

for (const [id, result] of Object.entries(layouts)) {
  if (result.applied !== id) failures.push(`layout ${id} não foi aplicado`);
}
if (layouts.hidden.band) failures.push("layout 'ocultar' deixou a faixa visível");
if (!layouts.bottom.band || layouts.bottom.band.y <= layouts.bottom.slides.y) {
  failures.push("layout 'abaixo' não pôs a faixa embaixo");
}
if (!layouts.top.band || layouts.top.band.y >= layouts.top.slides.y) {
  failures.push("layout 'acima' não pôs a faixa em cima");
}
if (!layouts.right.band || layouts.right.band.x <= layouts.right.slides.x) {
  failures.push("layout 'lateral' não pôs a faixa à direita");
}
if (layouts.overlay.slides.h <= layouts.bottom.slides.h) {
  failures.push("layout 'sobre os slides' não deixou os slides em tela cheia");
}
// A legenda mede pelo contêiner: na lateral estreita ela precisa encolher.
// (As medidas de layout são tomadas antes dos arrastos, com os tamanhos padrão.)
if (!(layouts.right.captionPx < layouts.bottom.captionPx)) {
  failures.push(
    `legenda não encolheu na lateral (${layouts.right.captionPx}px vs ${layouts.bottom.captionPx}px)`,
  );
}

await browser.close();
if (failures.length) {
  console.error("\nFALHAS:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("\nOK");
