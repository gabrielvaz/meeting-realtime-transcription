# Estudo da API — OpenAI Realtime Translation (`gpt-realtime-translate`)

> Pesquisa feita em **2026-09-12** a partir da documentação oficial atual.
> Fontes primárias (baixadas em Markdown com o sufixo `.md`, que a OpenAI publica para cada página):
>
> - `https://developers.openai.com/api/docs/guides/realtime-translation.md`
> - `https://developers.openai.com/api/docs/models/gpt-realtime-translate.md`
> - `https://developers.openai.com/api/docs/guides/voice-webrtc.md`
> - `https://developers.openai.com/api/reference/resources/realtime/translation-client-events.md`
> - `https://developers.openai.com/api/reference/resources/realtime/translation-server-events.md`
> - `https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide.md`
> - Código-fonte do demo oficial: `openai/openai-cookbook` →
>   `examples/voice_solutions/realtime_translation_guide/browser-translation-demo/src/`
>
> Tudo abaixo vem dessas fontes. Onde a documentação é silenciosa, está marcado
> explicitamente como **não documentado**.

---

## 1. O modelo

| Campo | Valor |
|---|---|
| Model ID | `gpt-realtime-translate` |
| Snapshot / alias | apenas `gpt-realtime-translate` (não há data no nome) |
| Modalidades de entrada | áudio |
| Modalidades de saída | áudio **e** texto |
| Context window | 16.000 |
| Max output tokens | 2.000 |
| Knowledge cutoff | 30/09/2024 |
| Features | streaming |
| Preço | **US$ 0,034 por minuto de áudio** (cobrança por duração, não por token) |

### Rate limits (minutos de áudio por minuto)

| Tier | Minutos-de-áudio/minuto |
|---|---:|
| 1 | 50 |
| 2 | 200 |
| 3 | 400 |
| 4 | 650 |
| 5 | 850 |

Como cada idioma de saída consome uma sessão própria, **N idiomas simultâneos
consomem N minutos-de-áudio por minuto real** — isso conta tanto para custo
quanto para rate limit.

### Endpoints suportados pelo modelo

A tabela oficial do modelo marca **todos** os endpoints como *Not supported*,
exceto um:

| Endpoint | Suporte |
|---|---|
| `v1/realtime/translations` | **Supported** |
| `v1/realtime` (voice agent) | Not supported |
| `v1/realtime/transcription_sessions` | Not supported |
| `v1/audio/translations`, `v1/audio/transcriptions`, `v1/responses`, `v1/chat/completions`, … | Not supported |

Ou seja: não existe caminho de "Whisper → GPT → TTS" com este modelo. Ele só
funciona no endpoint dedicado de tradução realtime.

---

## 2. Como a sessão de tradução difere de uma sessão de voz

Tabela da documentação (`realtime-translation.md`):

| Sessão voice-agent | Sessão de tradução |
|---|---|
| Conecta em `/v1/realtime` | Conecta em `/v1/realtime/translations` |
| O modelo age como assistente | O modelo age como intérprete |
| Ciclo de conversa + response | Fluxo contínuo a partir do áudio de entrada |
| Pode chamar tools e produzir turnos | Produz áudio traduzido e deltas de transcript |
| Você chama `response.create` | **Você nunca chama `response.create`** |

Consequências práticas:

- **Não existe turn lifecycle.** Nada de `response.create`, `conversation.item.create`,
  VAD/`turn_detection`, `input_audio_buffer.commit`. A tradução começa a partir do
  próprio stream de áudio.
- **Streaming contínuo.** A documentação manda continuar enviando áudio,
  *incluindo o silêncio entre as frases*. Se o cliente para de enviar e depois
  retoma, o modelo trata o áudio retomado como contíguo ao anterior, e não como
  uma pausa real.
- **Voz dinâmica.** Não há parâmetro de `voice`. A fala traduzida acompanha tom,
  altura e estilo do falante de origem ("dynamic voice adaptation"). Em sessão
  multi-falante, a voz traduzida muda conforme entra áudio de um novo falante.
- **Sem prompt customizado.** O modelo "does not currently support custom
  prompting or voice selection parameters". Também não aceita glossários nem
  guias de pronúncia.

---

## 3. Endpoints

| Uso | Método / URL |
|---|---|
| Criar client secret efêmero (servidor) | `POST https://api.openai.com/v1/realtime/translations/client_secrets` |
| Abrir a call WebRTC (browser, com o client secret) | `POST https://api.openai.com/v1/realtime/translations/calls` |
| Sessão WebSocket (servidor) | `wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate` |

### 3.1 Client secret — request

Corpo exato usado pelo demo oficial (`src/session.js`):

```json
{
  "session": {
    "model": "gpt-realtime-translate",
    "audio": {
      "input": {
        "transcription": { "model": "gpt-realtime-whisper" },
        "noise_reduction": { "type": "far_field" }
      },
      "output": { "language": "pt" }
    }
  }
}
```

Headers: `Authorization: Bearer $OPENAI_API_KEY`, `Content-Type: application/json`.
O guia também mostra `OpenAI-Safety-Identifier: hashed-user-id` (identificador
de usuário com hash, opcional mas recomendado).

### 3.2 Client secret — response

O demo oficial valida assim:

```js
const data = await response.json();
if (!data || typeof data.value !== "string") {
  throw new Error("OpenAI did not return a client secret value.");
}
// data.value       -> string do client secret (é o Bearer usado no browser)
// data.expires_at  -> epoch em segundos (opcional)
// data.session     -> config da sessão (opcional)
```

> **Divergência encontrada na documentação.** O guia
> (`realtime-translation.md`) desestrutura `const { value: clientSecret } = ...`,
> enquanto o texto do cookbook mostra `session.client_secret`. O código real do
> demo oficial confirma que o campo da resposta da OpenAI é **`value`** —
> `client_secret` é apenas o nome que o *servidor do demo* dá ao repassar para o
> browser. Nesta aplicação o Route Handler normaliza e devolve `{ value, expires_at }`.

### 3.3 Call WebRTC

```
POST https://api.openai.com/v1/realtime/translations/calls
Authorization: Bearer <client secret efêmero>
Content-Type: application/sdp
body: <SDP offer>
→ 200, body = <SDP answer> (text/plain)
```

Note que a URL **não** é `/v1/realtime/calls` (essa é a de voice agent).

---

## 4. Fluxo WebRTC no browser (o que esta app usa)

1. O servidor Next.js cria o client secret de curta duração — a `OPENAI_API_KEY`
   nunca sai do servidor.
2. O browser captura áudio (`getUserMedia`; o cookbook usa `getDisplayMedia`
   para áudio de aba).
3. O browser cria um `RTCPeerConnection`, adiciona a audio track e abre um
   data channel chamado exatamente **`oai-events`**.
4. O browser faz `POST` do SDP offer para o endpoint de calls de tradução com o
   client secret.
5. O modelo devolve o áudio traduzido numa **remote audio track** e os deltas de
   transcript pelo **data channel**.

Código do guia oficial, reproduzido:

```js
const pc = new RTCPeerConnection();
pc.addTrack(sourceStream.getAudioTracks()[0], sourceStream);

const translatedAudio = new Audio();
translatedAudio.autoplay = true;
pc.ontrack = ({ streams }) => { translatedAudio.srcObject = streams[0]; };

const events = pc.createDataChannel("oai-events");
events.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.type === "session.output_transcript.delta") {
    subtitles.textContent += event.delta;
  }
};

const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

const sdpResponse = await fetch(
  "https://api.openai.com/v1/realtime/translations/calls",
  { method: "POST",
    headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
    body: offer.sdp });

await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
```

O demo oficial **não** envia `session.update` pelo data channel: toda a
configuração (modelo, idioma de saída, transcrição de origem, noise reduction)
vai no corpo do client secret. Esta app segue o mesmo caminho.

---

## 5. Eventos

### 5.1 Client events (`translation-client-events.md`)

Só existem três, e **os dois primeiros só fazem sentido em WebSocket**:

| Evento | Uso |
|---|---|
| `session.update` | Atualiza `audio.output.language`, `audio.input.transcription`, `audio.input.noise_reduction`. `type` e `model` são fixados na criação e **não** podem mudar. |
| `session.input_audio_buffer.append` | Envia áudio base64 PCM16 24 kHz mono little-endian. **Só WebSocket** — no WebRTC o áudio vai pela media track. |
| `session.close` | Fecha a sessão com graça; o servidor faz flush do áudio pendente e emite o que faltar antes de `session.closed`. Exclusivo de sessões de tradução. |

Detalhe importante do `append` (vale como modelo mental mesmo no WebRTC):
a tradução consome **frames de 200 ms**. Chunks menores são bufferizados;
maiores são divididos em frames de 200 ms enfileirados.

### 5.2 Server events (`translation-server-events.md`)

| Evento | Conteúdo |
|---|---|
| `session.created` | Primeiro evento da conexão. Traz `session.id` (`sess_…`), `type: "translation"`, `model`, `expires_at`, e a config de áudio. |
| `session.updated` | Resposta a um `session.update` bem-sucedido. |
| `session.input_transcript.delta` | `delta: string` — transcript **na língua de origem**. Só é emitido se `audio.input.transcription` estiver configurado. Tem `elapsed_ms` opcional. |
| `session.output_transcript.delta` | `delta: string` — transcript **da tradução**. Tem `elapsed_ms` opcional. |
| `session.output_audio.delta` | Áudio traduzido base64 PCM16. **Só relevante em WebSocket**; no WebRTC o áudio chega pela remote track. Campos: `delta`, `sample_rate` (24000), `channels`, `format: "pcm16"`, `elapsed_ms`. |
| `session.closed` | A sessão fechou. |
| `error` | `error.{message,type,code,param,event_id}`. "Most errors are recoverable and the session will stay open" — logar sempre, não derrubar a sessão automaticamente. |

#### Regra crítica para montar a legenda

> "Transcript deltas are append-only text fragments. **Clients should not insert
> unconditional spaces between deltas.**"

Ou seja: concatenar `texto += delta` e nada mais. Nada de `join(" ")`, nada de
uma linha nova por delta.

#### `elapsed_ms` não é um ID

> "It advances in 200 ms increments, but multiple transcript deltas may share the
> same `elapsed_ms`. Treat it as alignment metadata, not a unique
> transcript-delta identifier."

#### Não existe evento de "fim de frase"

A documentação **não define** nenhum evento de conclusão de trecho para
transcript (não há `…transcript.done`, `…transcript.completed`). O único evento
terminal é `session.closed`, que encerra a sessão inteira. Portanto o
fatiamento em "trecho atual / trecho anterior" precisa ser feito no cliente —
esta app corta por pontuação final e por pausa (ver `lib/realtime/subtitleBuffer.ts`).

---

## 6. Idiomas

### 6.1 Idiomas de SAÍDA — 13, lista exata

Do cookbook oficial: *"Realtime Translation currently supports 13 target output
languages: Spanish, Portuguese, French, Japanese, Russian, Chinese, German,
Korean, Hindi, Indonesian, Vietnamese, Italian, and English."*

Os códigos exatos vêm do `SUPPORTED_TRANSLATION_LANGUAGES` do demo oficial
(`src/session.js`), que rejeita qualquer outro código:

| Código | Idioma |
|---|---|
| `es` | Espanhol |
| `pt` | Português |
| `fr` | Francês |
| `ja` | Japonês |
| `ru` | Russo |
| `zh` | Chinês |
| `de` | Alemão |
| `ko` | Coreano |
| `hi` | Híndi |
| `id` | Indonésio |
| `vi` | Vietnamita |
| `it` | Italiano |
| `en` | Inglês |

O demo também aplica o regex `^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$` antes de
checar a lista.

### 6.2 Idiomas de ENTRADA — 70+, detectados automaticamente

*"It accepts spoken input, **automatically detects the source language**, and
returns translated speech plus text transcripts. Developers only need to specify
the target output language."*

Lista oficial de entrada: Árabe, Africâner, Azerbaijano, Bielorrusso, Bengali,
Bósnio, Búlgaro, Catalão, Chinês, Croata, Tcheco, Dinamarquês, Holandês,
Dzongkha, Inglês, Esperanto, Estoniano, Basco, Persa/Farsi, Finlandês, Filipino,
Francês, Galego, Alemão, Grego, Guzerate, Crioulo haitiano, Havaiano, Hebraico,
Híndi, Húngaro, Armênio, Indonésio, Italiano, Japonês, Javanês, Georgiano,
Cazaque, Coreano, Curdo, Latim, Letão, Lituano, Macedônio, Malaio, Malaiala,
Maori, Mongol, Birmanês, Nepali, Norueguês, Nynorsk, Polonês, Português,
Punjabi, Romeno, Russo, Sérvio, Shona, Eslovaco, Esloveno, Albanês, Espanhol,
Suaíli, Sueco, Tagalo, Telugo, Tailandês, Turco, Ucraniano, Uzbeque,
Vietnamita, Galês, Iorubá.

**Não existe parâmetro para fixar o idioma de entrada** numa sessão de
tradução — e isso foi confirmado contra a API real, não só lido.

O schema de `session.update` só expõe `audio.input.transcription.model`. O
*exemplo* de `session.created` no reference mostra um campo `language` dentro de
`transcription`, o que sugeria que ele existisse. Não existe. Teste em
2026-09-12 contra `POST /v1/realtime/translations/client_secrets`:

| Tentativa | Resposta |
|---|---|
| `session.audio.input.transcription.language: "en"` | `400` · `Unknown parameter: 'session.audio.input.transcription.language'` |
| `session.audio.input.language: "en"` | `400` · `Unknown parameter: 'session.audio.input.language'` |
| `session.audio.input.transcription.xyzzy: "en"` (controle) | `400` · `Unknown parameter: 'session.audio.input.transcription.xyzzy'` |

O campo inventado no grupo de controle recebe exatamente a mesma resposta que os
dois candidatos — ou seja, a API não os conhece. O `language` do exemplo é
desatualização da documentação.

Conclusão para a UI: o idioma falado é **sempre** detecção automática, e não há
seletor de entrada. Colocar um seria simular um controle que não controla nada.

---

## 7. Uma sessão por idioma de saída

Texto literal do guia:

> "Create one translation session for each target language. If the same English
> source needs Spanish and French output, create one English-to-Spanish session
> and one English-to-French session."

E no production checklist: *"Use one session per output language."*

Arquitetura desta app:

```
getUserMedia() (UMA vez)
  └── MediaStreamTrack
        ├── RTCPeerConnection → /v1/realtime/translations/calls (output pt)
        ├── RTCPeerConnection → /v1/realtime/translations/calls (output it)
        └── RTCPeerConnection → /v1/realtime/translations/calls (output fr)
```

Uma mesma `MediaStreamTrack` pode ser adicionada a várias `RTCPeerConnection`
sem reabrir o microfone — é comportamento padrão do WebRTC (`addTrack` aceita a
mesma track em peer connections diferentes; cada PC cria seu próprio
`RTCRtpSender`). Portanto: **um `getUserMedia`, N peer connections**.

---

## 7.1 O áudio traduzido não é opcional

Verificado contra a API em 2026-09-13, numa aplicação que só quer legenda:

| Transceiver | Conexão | Remote tracks | Transcript |
|---|---|---|---|
| `addTrack` (sendrecv, padrão) | `connected` | 1 | chega normalmente |
| `addTransceiver(..., { direction: "sendonly" })` | `connected` | 0 | **nada** |

Ou seja: recusar a track de áudio traduzido para economizar banda **desliga a
legenda junto**, e de forma silenciosa — a conexão continua saudável e nenhum
erro é emitido. Quem quer só legenda precisa receber o áudio e simplesmente não
reproduzi-lo.

## 8. Ciclo de vida, encerramento e reconexão

- **WebSocket:** enviar `session.close`, **continuar lendo eventos** até receber
  `session.closed`, e só então fechar o socket. Fechar o socket direto pode
  cortar áudio traduzido ainda em drenagem.
- **WebRTC:** a documentação não define `session.close` pelo data channel —
  encerrar é `dataChannel.close()` + `pc.close()`. O demo oficial faz exatamente
  isso. Como a app descarta o áudio residual ao parar, não há perda relevante.
- **Reconexão:** o guia lista "reconnect behavior" como item de teste e
  "Surface reconnecting, delayed, and unavailable states" no checklist, mas
  **não define** um protocolo de reconexão. Não há resume de sessão: reconectar
  significa criar um **novo** client secret e uma **nova** peer connection.
  Sinal de detecção: `RTCPeerConnection.connectionState` em `failed` /
  `disconnected` e `dataChannel.readyState` em `closed`.
- **Expiração:** `session.expires_at` (epoch em segundos) vem no
  `session.created`. O client secret é de curta duração e serve só para abrir a
  call.

---

## 9. Segurança em aplicação browser

Do guia: *"For browser apps, create a short-lived client secret on your server.
Don't expose your standard API key in the browser."*

Regras aplicadas nesta app:

- `OPENAI_API_KEY` só existe em `.env.local`, lido apenas dentro do Route
  Handler (`app/api/realtime/token/route.ts`), que roda no servidor.
- O browser recebe **apenas** `{ value, expires_at }` — o client secret efêmero.
- O idioma de destino é validado no servidor contra a lista de 13 antes de
  chamar a OpenAI (mesma proteção do demo oficial), para o endpoint não virar
  um proxy aberto.
- Header `OpenAI-Safety-Identifier` enviado com um identificador de sessão
  anônimo com hash — nunca e-mail nem dado pessoal.
- Route handler marcado `runtime = "nodejs"` e `dynamic = "force-dynamic"` para
  nunca ser cacheado.
- Nada é persistido: sem gravação de áudio, sem banco, sem log de transcript no
  servidor.

---

## 10. Limitações relevantes (todas com fonte)

1. **Sem prompt, glossário ou guia de pronúncia.** "The model does not currently
   support custom prompts, glossaries, or pronunciation guides." Nomes próprios
   e termos de domínio (ex.: "Holter") podem ser substituídos incorretamente —
   a documentação recomenda testar esses casos explicitamente. Note o contraste
   com os modelos de transcrição pura (`gpt-transcribe`), que aceitam `prompt`,
   `keywords` e `languages`: nada disso existe em `/v1/realtime/translations`.
   A única saída é corrigir o texto no cliente depois que ele chega — é o que
   `lib/glossary.ts` faz.
2. **Sem seleção de voz.** A voz da saída imita o falante de origem.
3. **Fala já no idioma de saída pode gerar silêncio.** "Realtime Translation
   tries not to translate speech that is already in the selected output
   language." Se a saída é `pt` e a pessoa fala português, pode não sair nada.
   Recomendação oficial: manter o áudio original disponível (fazer *ducking* em
   vez de mute total) e/ou mostrar legenda da origem.
4. **Código-switching assimétrico.** "Spanglish to German" funciona bem;
   "Spanglish to English" fica irregular porque as partes já em inglês ficam
   mudas.
5. **13 idiomas de saída, 70+ de entrada.** O conjunto de saída é muito menor —
   não assumir que um idioma de entrada é também de saída.
6. **Sem word-level timestamps, sem speaker labels, sem confidence score** nesta
   sessão. Diarização existe só em `/v1/audio/transcriptions` com
   `gpt-4o-transcribe-diarize`, que **não** é suportado por este modelo.
7. **Sem evento de fim de frase** no transcript (ver §5.2).
8. **Custo e rate limit multiplicam por idioma.** US$ 0,034/min × número de
   sessões ativas. Tier 1 = 50 minutos-de-áudio por minuto, ou seja no máximo
   ~50 sessões simultâneas em Tier 1.
9. **`session.close` só existe em sessões de tradução** e só é descrito para o
   transporte WebSocket.
10. **Context window de 16k / 2k output.** Não documentado como isso se traduz
    em duração máxima de sessão; `expires_at` é a referência prática.
11. **Áudio WebSocket é estrito:** 24 kHz PCM16 mono little-endian. Formatos
    diferentes retornam erro de validação "because lower-quality audio
    materially degrades translation quality". No WebRTC a negociação é feita
    pelo próprio SDP, então isso não se aplica ao browser.

---

## 11. Anexo — comparação com o caminho de transcrição pura

Só para registro de por que **não** usamos `gpt-transcribe`:

| | `gpt-realtime-translate` | `gpt-transcribe` / `gpt-live-transcribe` |
|---|---|---|
| Endpoint | `/v1/realtime/translations` | `/v1/audio/transcriptions`, `/v1/realtime/transcription_sessions` |
| Saída | áudio traduzido + transcript traduzido + transcript de origem | só texto |
| Tradução | nativa, speech-to-speech | nenhuma (precisaria de um LLM no meio + TTS) |
| Preço | US$ 0,034/min de áudio | US$ 0,0045/min (`gpt-transcribe`) |

A arquitetura "microfone → Whisper → GPT → TTS" acrescenta dois saltos de
latência e não é necessária aqui.
