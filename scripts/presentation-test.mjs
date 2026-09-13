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

await browser.close();
if (failures.length) {
  console.error("\nFALHAS:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("\nOK");
