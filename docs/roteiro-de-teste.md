# Roteiro de teste

Executado em **2026-09-12** contra a API real, com chave com acesso a
`gpt-realtime-translate`. **Os 16 passos passaram.**

## Resultado

| # | Passo | Resultado |
|---|---|---|
| 1 | `npm run lint` | sem erros |
| 2 | `npx tsc --noEmit` | sem erros |
| 3 | `npm run build` | build completo: `/`, `/_not-found`, `ƒ /api/realtime/token` |
| 4 | Corrigir erros | nenhum pendente |
| 5 | Abrir a aplicação local | HTTP 200 |
| 6 | Fluxo real no browser | Chrome 152, fala em inglês injetada (ver abaixo) |
| 7 | Acesso ao microfone | concedido, `enumerateDevices` popula o seletor |
| 8 | Falar uma frase em inglês | `session.input_transcript.delta` chegando |
| 9 | Tradução em Português | `"The app should capture this audio from the tab and stream it to the model."` → `"O app deve capturar esse áudio da aba e transmiti-lo ao modelo."` |
| 10 | Português + Italiano simultâneos | as duas regiões atualizando ao mesmo tempo |
| 11 | Duas sessões, uma captura | `peers: 2`, `getUserMedia: 1` |
| 12 | Streaming da legenda | frase atual cresce em opacidade cheia; ao fechar, vira a anterior a 42% |
| 13 | Áudio traduzido | só o primeiro idioma começa audível (`muted: [false, true]`); "Ouvir tradução" no italiano inverte para `[true, false]` |
| 14 | Trocar idioma durante a sessão | adicionar italiano cria **1** peer nova e o português não pisca; remover italiano fecha só a dele (`openPeers: 2 → 1`) |
| 15 | Parar | volta ao estado inicial |
| 16 | Conexões encerradas | `openPeers: 0`, `peerStates: ["closed","closed"]` |

Latência medida até o primeiro delta de tradução (`transcript.first`):
**2,9 s a 4,0 s** em quatro execuções.

### Verificado depois, nas features seguintes

| Verificação | Resultado |
|---|---|
| Dropdown de idiomas na tela ao vivo | adicionar italiano criou 1 peer nova; remover fechou só a dela |
| Menu de leitura | `arrangement: rows`, fonte `Source Serif 4`, escala `1.2`, legenda a `57.6px` |
| Pausar | `openPeers: 0` e texto preservado na íntegra |
| Retomar | novas sessões abertas, legenda continuou de onde parou |
| Histórico no `localStorage` | 1 sessão, `durationMs: 49639`, `["pt","it"]`, 14 trechos de origem |
| `getUserMedia` durante a sessão | 1 |

> Nota sobre um falso positivo que o teste pegou: depois de "Parar", a tela
> inicial religa a prévia do microfone, então `getUserMedia` chega a 2 no ciclo
> de vida da página. O invariante que importa é **1 por sessão**, e é isso que o
> teste passou a medir.

### Sobre clicar em componentes Radix

Os menus do shadcn respondem a eventos reais de ponteiro, não a `element.click()`
sintético. Um teste que usa `evaluate(() => el.click())` passa em silêncio sem
ter clicado em nada. O smoke test usa `page.click()` em seletores estáveis
(`[data-menu]`, `[data-lang-menu]`, `[data-action]`, `[data-pause-toggle]`).

Verificações de segurança e forma, no mesmo teste:

- exatamente **13 idiomas** na tela, e são os 13 da documentação;
- fonte resolvida para `Inter`, fundo `rgb(255, 255, 255)`, nenhum emoji no DOM;
- a única requisição da aplicação para o servidor é `POST /api/realtime/token`;
  o browser só fala com `api.openai.com` no POST do SDP, autenticado com o
  client secret efêmero;
- `sk-` não aparece no HTML servido;
- o Route Handler recusa idioma fora da lista (`sv` → 400
  `kind: "unsupported-language"`) e mapeia 401 para `kind: "auth"`, que aparece
  na interface como "Credencial recusada pela OpenAI";
- responsivo verificado em 1600×1000 (duas colunas) e 414×896 (coluna única).

## Como reproduzir

```bash
cp .env.example .env.local          # preencha OPENAI_API_KEY
env -u OPENAI_API_KEY -u OPENAI_BASE_URL npm run dev
```

O `env -u` é necessário se a sua shell já exporta `OPENAI_API_KEY` apontando
para outro gateway: variáveis de ambiente reais têm precedência sobre
`.env.local` e o sintoma é um 401 que parece culpa do arquivo.

Em outro terminal:

```bash
APP_URL=http://localhost:3000 node scripts/smoke-test.mjs
```

O script imprime um JSON por etapa com número de peer connections, quais estão
abertas, quantas vezes `getUserMedia` foi chamado, o estado de mute de cada
áudio e o texto das legendas — e sai com código 1 se algum invariante quebrar.
Capturas e `report.json` vão para `.smoke/`.

`HEADFUL=1` abre o Chrome visível.

## Nota: o microfone falso do Chrome

O flag `--use-file-for-fake-audio-capture` **é ignorado no Chrome for Testing
152**: o dispositivo falso entrega silêncio absoluto (pico 0.000 em 24 amostras),
enquanto o beep padrão do `--use-fake-device-for-media-stream` passa
normalmente (picos de 1.13). Testado com WAV a 24 kHz e a 48 kHz, com e sem
`echoCancellation`/`noiseSuppression`/`autoGainControl` — silêncio em todos.

Por isso o smoke test substitui `navigator.mediaDevices.getUserMedia` por uma
`MediaStream` produzida com WebAudio a partir de
`scripts/source-speech.wav`, embutido como data URL:

```js
const ctx = new AudioContext({ sampleRate: 48000 });
const el = new Audio(audioSrc);
el.loop = true;
const dest = ctx.createMediaStreamDestination();
ctx.createMediaElementSource(el).connect(dest);
await el.play();
return dest.stream;
```

Isso não é um atalho em volta do código de produção: o que sai daí é uma
`MediaStreamTrack` real, adicionada às peer connections pelo mesmo caminho do
microfone de verdade. O que o teste não cobre é a camada de drivers do sistema.

O áudio (14,9 s de fala em inglês, 24 kHz PCM16) vem do demo oficial da OpenAI,
em `openai/openai-cookbook`.

## O que observar no console durante um teste manual

```
[translate:pt] webrtc.connection — connected
[translate:pt] session.created — sess_...
[translate:pt] datachannel — open
[translate:pt] remote.audio — track recebida
[translate:pt] transcript.first — 3964 ms
```

`transcript.first` é a métrica de latência que importa: tempo entre o clique em
Iniciar e o primeiro delta de tradução.
