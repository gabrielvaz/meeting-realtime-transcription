/**
 * Smoke test ponta a ponta da tradução ao vivo.
 *
 * Sobe um Chrome headless, substitui `getUserMedia` por uma MediaStream gerada
 * com WebAudio a partir de `scripts/source-speech.wav` (14,9 s de fala em
 * inglês, do cookbook oficial da OpenAI) e roda o fluxo real contra a API.
 *
 * Por que não o flag do Chrome: `--use-file-for-fake-audio-capture` é ignorado
 * no Chrome for Testing 152 — o dispositivo falso entrega silêncio. A injeção
 * por WebAudio passa pelo mesmo caminho do app (uma MediaStreamTrack real
 * adicionada às peer connections), então o que é exercitado é o código de
 * produção, não um atalho.
 *
 * Uso:
 *   npm i -D puppeteer-core
 *   APP_URL=http://localhost:3000 node scripts/smoke-test.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-152.0.7977.75/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? ".smoke";
const SPEECH = path.join(import.meta.dirname, "source-speech.wav");

fs.mkdirSync(OUT, { recursive: true });
const speechDataUrl = `data:audio/wav;base64,${fs.readFileSync(SPEECH).toString("base64")}`;

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
  // Dicionário de teste: "modelo" aparece em toda volta do áudio, então se a
  // correção chega à legenda, "MODELO-X" aparece na tela.
  window.localStorage.setItem(
    "live-translation:glossary",
    JSON.stringify([{ id: "t", term: "MODELO-X", variants: ["modelo"] }]),
  );
  window.__probe = { gum: 0, peers: [], audios: [] };

  navigator.mediaDevices.getUserMedia = async () => {
    window.__probe.gum += 1;
    const ctx = new AudioContext({ sampleRate: 48000 });
    const el = new Audio(audioSrc);
    el.loop = true;
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaElementSource(el).connect(dest);
    await ctx.resume();
    await el.play();
    return dest.stream;
  };

  const NativePeer = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends NativePeer {
    constructor(...args) {
      super(...args);
      const record = { closed: false, self: this };
      window.__probe.peers.push(record);
      const close = this.close.bind(this);
      this.close = () => { record.closed = true; return close(); };
    }
  };

  const NativeAudio = window.Audio;
  window.Audio = class extends NativeAudio {
    constructor(...args) { super(...args); window.__probe.audios.push(this); }
  };
}, speechDataUrl);

let readingApplied = null;
const logs = [];
page.on("console", (m) => {
  const text = m.text();
  if (text.includes("[translate:") || text.includes("[caption:")) logs.push(text);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

const state = () => page.evaluate(() => ({
  panels: [...document.querySelectorAll(".panel")].map((p) => ({
    lang: p.querySelector(".panel-title")?.textContent,
    status: p.querySelector(".panel-status")?.textContent ?? "",
    error: p.querySelector(".panel-error")?.textContent ?? "",
    past: p.querySelectorAll(".caption.is-past").length,
    current: (p.querySelector(".caption.is-current")?.textContent ?? "").slice(0, 40),
  })),
  source: (document.querySelector(".source-text")?.textContent ?? "").slice(0, 60),
  gum: window.__probe.gum,
  peers: window.__probe.peers.length,
  openPeers: window.__probe.peers.filter((p) => !p.closed).length,
  // Áudio traduzido nunca pode ser reproduzido: esta é uma ferramenta de legenda.
  playingAudio: window.__probe.audios.filter((a) => a.srcObject && !a.paused).length,
}));

const click = (text) =>
  page.evaluate((t) => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t))?.click();
  }, text);

/**
 * Os menus do Radix respondem a eventos reais de ponteiro, não a `.click()`
 * sintético — por isso aqui usamos `page.click`, que move o mouse de verdade.
 */
const openMenu = async (name) => {
  await page.click(`[data-menu="${name}"]`);
  await wait(400);
};

const closeMenu = async () => {
  await page.keyboard.press("Escape");
  await wait(300);
};

const toggleLanguageInMenu = async (code) => {
  await openMenu("languages");
  await page.click(`[data-lang-menu="${code}"]`);
  await wait(300);
  await closeMenu();
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const step = async (name, fn) => { const r = await fn(); console.log(name.padEnd(22), JSON.stringify(r)); return r; };

await page.goto(APP_URL, { waitUntil: "networkidle2" });
await page.screenshot({ path: `${OUT}/01-idle.png` });

const idle = await page.evaluate(() => ({
  title: document.querySelector(".title")?.textContent,
  background: getComputedStyle(document.body).backgroundColor,
  font: getComputedStyle(document.body).fontFamily.split(",")[0],
  languages: [...document.querySelectorAll("[data-lang]")].map((el) =>
    el.parentElement?.querySelector("label")?.textContent,
  ),
  microphone: document.querySelector("#microphone")?.textContent,
  waveform: !!document.querySelector("canvas[role='img']"),
  emoji: /\p{Extended_Pictographic}/u.test(document.body.innerText),
}));
console.log("idle", JSON.stringify(idle, null, 2));

// "Mostrar transcrição original" já vem ligada por padrão.
await click("Iniciar");
await wait(14000);
await step("1 idioma", state);
await page.screenshot({ path: `${OUT}/02-um-idioma.png` });

await toggleLanguageInMenu("it");
await wait(12000);
await step("+italiano", state);
await page.screenshot({ path: `${OUT}/03-dois-idiomas.png` });


// Menu de leitura: fonte, tamanho e organização.
await openMenu("reading");
await page.click('[aria-label="Aumentar fonte"]');
await page.click('[aria-label="Aumentar fonte"]');
await page.click('[data-font="source-serif"]');
await wait(200);
await page.click('[data-arrangement="rows"]');
await wait(200);
await closeMenu();
await wait(1200);
await step("leitura", async () => {
  return page.evaluate(() => {
    const grid = document.querySelector(".grid");
    const caption = document.querySelector(".caption");
    return {
      arrangement: grid?.getAttribute("data-arrangement"),
      fontFamily: getComputedStyle(grid).fontFamily.split(",")[0],
      captionPx: caption ? getComputedStyle(caption).fontSize : null,
      scale: grid ? getComputedStyle(grid).getPropertyValue("--caption-scale").trim() : null,
    };
  });
});
readingApplied = await page.evaluate(() => {
  const grid = document.querySelector(".grid");
  return {
    arrangement: grid?.getAttribute("data-arrangement"),
    font: getComputedStyle(grid).fontFamily.split(",")[0],
    scale: getComputedStyle(grid).getPropertyValue("--caption-scale").trim(),
  };
});
await page.screenshot({ path: `${OUT}/04-leitura.png` });

// Pausar e retomar: o texto tem de sobreviver.
// Espaços normalizados: ao pausar, o trecho em curso é fechado e passa por
// `trim()`, o que muda o espaçamento sem que nada tenha se perdido.
const captionText = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".caption")]
      .map((c) => c.textContent.replace(/\s+/g, " ").trim())
      .join(" | "),
  );
const beforePause = await captionText();
await page.click('[data-pause-toggle]');
await wait(2500);
const paused = await step("pausado", state);
const afterPause = await captionText();
await page.screenshot({ path: `${OUT}/05-pausado.png` });
await page.click('[data-pause-toggle]');
await wait(8000);
await step("retomado", state);

// Esconder o italiano não pode apagar o que ele já traduziu.
const italianBefore = await page.evaluate(() => {
  const p = document.querySelector('[data-panel="it"]');
  return [...p.querySelectorAll(".caption")].map((c) => c.textContent).join(" | ");
});
await toggleLanguageInMenu("it");
await wait(3000);
const hidden = await step("italiano escondido", state);
// E marcar de volta traz o texto intacto.
await toggleLanguageInMenu("it");
await wait(3000);
const italianAfter = await page.evaluate(() => {
  const p = document.querySelector('[data-panel="it"]');
  return p ? [...p.querySelectorAll(".caption")].map((c) => c.textContent).join(" | ") : "";
});
await step("italiano de volta", state);
await page.screenshot({ path: `${OUT}/05-italiano-de-volta.png` });

await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
await wait(5000);
await page.screenshot({ path: `${OUT}/06-mobile.png` });
await page.setViewport({ width: 1600, height: 1000 });

// `gum` precisa ser medido AINDA na sessão: ao parar, a tela inicial religa
// a prévia do microfone e capturar de novo ali é o comportamento correto.
// Trecho atual preto, trechos fechados cinza, e a área rolada até o fim.
/**
 * A ancoragem é eventual, não instantânea: depois de uma mudança de layout ela
 * se resolve no próximo quadro. Medir num instante arbitrário produz falha
 * intermitente, então esperamos o valor assentar.
 */
const measureCaption = () =>
  page.evaluate(() => {
  const body = document.querySelector(".panel-body");
  const style = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el) : null;
  };
  const color = (sel) => style(sel)?.color ?? null;
  const weight = (sel) => style(sel)?.fontWeight ?? null;
  return {
    past: color(".caption.is-past"),
    current: color(".caption.is-current"),
    pastWeight: weight(".caption.is-past"),
    currentWeight: weight(".caption.is-current"),
    distanceFromBottom: body
      ? body.scrollHeight - body.scrollTop - body.clientHeight
      : null,
    painel: body?.closest(".panel")?.querySelector(".panel-title")?.textContent,
  };
  });

let captionStyle = await measureCaption();
for (let attempt = 0; attempt < 8 && captionStyle.distanceFromBottom > 4; attempt += 1) {
  await wait(250);
  captionStyle = await measureCaption();
}
console.log("estilo da legenda".padEnd(22), JSON.stringify(captionStyle));

// A partir daqui o teste mexe na seleção de texto, o que faz o navegador rolar
// o painel para revelá-la. Por isso a medição da rolagem fica acima.
// Correção rápida: selecionar uma palavra na legenda abre a barra de correção.
const quickCorrect = await page.evaluate(() => {
  const caption = document.querySelector(".stage .caption");
  const node = caption?.firstChild;
  if (!node || !node.textContent || node.textContent.length < 6) return false;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 5);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  return true;
});
await wait(500);
const quickBarVisible = await page.evaluate(() => {
  const visible = !!document.querySelector("[data-quick-correct]");
  window.getSelection()?.removeAllRanges();
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  return visible;
});
console.log("correção rápida".padEnd(22), JSON.stringify({ selecionou: quickCorrect, barra: quickBarVisible }));
await wait(300);

// O dicionário precisa ter alcançado o texto renderizado.
const glossaryApplied = await page.evaluate(() =>
  [...document.querySelectorAll(".caption")].some((c) =>
    c.textContent.includes("MODELO-X"),
  ),
);
console.log("dicionário aplicado".padEnd(22), glossaryApplied);

const live = await state();
const liveGum = live.gum;
if (live.playingAudio > 0) console.error("ALERTA: áudio traduzido tocando");
await page.click('[data-action="stop"]');
await wait(2000);
const stopped = await step("parado", state);

console.log("\nlogs:\n" + logs.join("\n"));
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ idle, stopped, logs }, null, 2));

// O histórico tem de ter guardado a sessão no localStorage.
const history = await page.evaluate(() => {
  const raw = window.localStorage.getItem("live-translation:sessions");
  const sessions = raw ? JSON.parse(raw) : [];
  return {
    count: sessions.length,
    durationMs: sessions[0]?.durationMs ?? 0,
    languages: sessions[0]?.languages ?? [],
    sourceSegments: sessions[0]?.source?.length ?? 0,
  };
});
console.log("histórico".padEnd(22), JSON.stringify(history));

const failures = [];
if (paused.openPeers !== 0) failures.push("pausa não fechou as sessões");
// Prefixo, não igualdade: entre a leitura e o clique em Pausar ainda chegam
// deltas, então o texto só pode ter crescido — nunca encolhido ou mudado.
if (!afterPause.startsWith(beforePause.slice(0, Math.min(beforePause.length, 60)))) {
  failures.push("pausa perdeu o texto da legenda");
}
if (history.count < 1) failures.push("sessão não foi gravada no histórico");
if (readingApplied?.arrangement !== "rows") failures.push("organização não aplicou");
if (hidden.panels.some((p) => p.lang === "ITALIANO")) failures.push("idioma desmarcado continuou visível");
if (!italianAfter.startsWith(italianBefore)) failures.push("texto do idioma se perdeu ao esconder/reexibir");
if (stopped.playingAudio > 0) failures.push("áudio traduzido foi reproduzido");
if (captionStyle.past && captionStyle.past === captionStyle.current) {
  failures.push("trecho antigo tem a mesma cor do atual");
}
// O trecho atual também é semi-bold: num projetor desbotado a diferença de
// cinza para preto se perde, o peso não.
if (captionStyle.currentWeight && Number(captionStyle.currentWeight) < 600) {
  failures.push(`trecho atual não está em semi-bold (${captionStyle.currentWeight})`);
}
if (
  captionStyle.pastWeight &&
  Number(captionStyle.pastWeight) >= Number(captionStyle.currentWeight)
) {
  failures.push("trecho antigo tem o mesmo peso do atual");
}
if (captionStyle.distanceFromBottom > 4) failures.push("legenda não rolou até o fim");
if (!glossaryApplied) failures.push("dicionário não chegou à legenda");
if (quickCorrect && !quickBarVisible) failures.push("barra de correção rápida não apareceu");
if (!readingApplied?.font?.includes("Source")) failures.push("troca de fonte não aplicou");
if (Number(readingApplied?.scale) <= 1) failures.push("aumento de fonte não aplicou");
if (!history.durationMs) failures.push("histórico sem duração");
if (idle.languages.length !== 13) failures.push("esperava 13 idiomas de saída");
if (idle.emoji) failures.push("emoji encontrado no DOM");
if (!idle.waveform) failures.push("onda de captura ausente");
if (stopped.openPeers !== 0) failures.push("sobrou RTCPeerConnection aberta após Parar");
if (liveGum !== 1) failures.push(`getUserMedia chamado ${liveGum} vezes na sessão, esperava 1`);

await browser.close();
if (failures.length) { console.error("\nFALHAS:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("\nOK");
