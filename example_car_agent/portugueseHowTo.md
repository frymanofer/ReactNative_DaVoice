# DaVoice: AI Car Voice Agent: guia (React Native)

> **Para** desenvolvedores que rodam este exemplo, mudam o app ou levam os recursos de voz para o próprio app React Native.
> Os caminhos são relativos a `example_car_agent/`. Pacotes: `react-native-wakeword` 1.1.171, `react-native-davoice` 1.0.142,
> `react-native-davoice-llm` 1.0.20. Última atualização: 2026-11-22. A versão em inglês é `englishHowTo.md`.

O app é um assistente de voz para carro que roda inteiro no celular: **palavra de ativação → (opcional) verificação de locutor →
fala para texto (STT) → o DaVoice Automotive Agent (um modelo de linguagem de 0,6B no celular) → uma ação num carro simulado →
texto para fala (TTS)**. Nada do que você diz sai do celular. O carro é simulado; o app não controla um veículo de verdade.

- **Parte A** — usar o app e mudar o app.
- **Parte B** — levar cada recurso para o **seu** app: a palavra de ativação, o cadastro da verificação de locutor, STT e TTS, a
  verificação de locutor com STT e a palavra de ativação, e um fluxo completo de voz a voz. Cada passo tem código para copiar.

| Pacote | Para quê |
|---|---|
| `react-native-wakeword` | palavra de ativação, verificação de locutor (cadastro e verificação ao vivo) |
| `react-native-davoice` | STT e TTS (`Speech`), vozes, clonagem de voz, quem falou cada frase |
| `react-native-davoice-llm` | o modelo no celular e o `Agent` (só para o agente do carro; a Parte B não precisa) |
| `react-native-fs` | arquivos: a assinatura de voz, vozes e modelos baixados |

---

# Parte A — Usar e mudar este app

## A1. Rodar

```bash
cd example_car_agent
npm install
cd ios && pod install && cd ..
npx react-native run-android        # or: npx react-native run-ios
```

- Builds de debug carregam o JavaScript do Metro (`npx react-native start`; Android no USB: `adb reverse tcp:8081 tcp:8081`).
  Mudanças de código precisam só de um reload (`r` no Metro). **Mudanças em arquivos empacotados** (modelos da palavra de ativação,
  listas de dicas do STT, código nativo) precisam de um novo build e reinstalação.
- Build de release (Android): `cd android && ./gradlew :app:assembleRelease` (pacote para a loja: `bundleRelease`).
- Logs (Android): `adb logcat | grep ReactNativeJS`; o log do agente: `adb logcat | grep DavoiceChat`.
- As licenças DaVoice deste exemplo são de demonstração. Para o seu app, peça a sua em info@davoice.io.

## A2. Fluxo de início

1. **Idioma** (11 idiomas). A voz dele é baixada na primeira vez (136–170 MB).
2. **Permissão do microfone.**
3. **Voz.** Uma voz pronta, uma voz que você clonou antes, ou clone uma nova.
4. **Verificação de locutor** (A4): criar uma assinatura de voz, usar a salva, ou pular.
5. **Palavra de ativação.** Diga **"Hey DaVoice"**. (Builds de debug: o botão de dev faz o mesmo.) O modelo é baixado em segundo
   plano (382 MB na primeira vez, mais um estado pré-aquecido de 430 MB, para a primeira resposta ser rápida).
6. **A tela do carro.** Com as configurações padrão, todo pedido começa com "Hey DaVoice" (A3). A linha de baixo sempre diz o que
   fazer: **"Say “Hey DaVoice” before each request"** enquanto espera, **"Listening… say your request"** depois da palavra de
   ativação.

**Back** volta para a tela da palavra de ativação. **Reset** começa uma conversa nova e reinicia o carro.

## A3. Configurações (a engrenagem)

A engrenagem fica em todas as telas (no canto de cima à direita; na tela do carro, na barra de cima). As mudanças são um rascunho
até você tocar em **Save**; **Cancel** ou um toque fora descartam. As configurações salvas ficam no celular.

| Configuração | Opções | O que faz |
|---|---|---|
| **Turnos** | **Take turns** (padrão) / Interrupt | Take turns: a escuta pausa enquanto o agente responde. Interrupt: você pode falar por cima do agente; usa cancelamento de eco (experimental no Android). |
| **Começar cada pedido com** | **Wake word** / Just talk | Wake word: diga "Hey DaVoice" antes de cada pedido. Just talk: sem palavra de ativação depois da primeira. |
| Fim da fala | 1–3 s (2 s) | O silêncio que encerra o seu pedido. |
| Escuta depois da palavra de ativação | 4–15 s (8 s) | Quanto tempo espera o seu pedido depois de "Hey DaVoice". |
| Resposta sem a palavra de ativação | Off, 5–30 s (8 s) | **Só quando o agente faz uma pergunta** ("Qual vidro?"): quanto tempo espera a sua resposta sem a palavra de ativação. |
| Pré-captura (pre-fetch) | Off, 0,5–3 s (2 s) | Guarda o áudio de logo antes de a escuta começar, para "Hey DaVoice, abre o vidro" dito de uma vez não ser cortado. A palavra de ativação nunca chega ao modelo. |
| A palavra de ativação para o agente | **Off** / On | On: dizer "Hey DaVoice" enquanto o agente fala para a resposta e você pode falar. |
| Parar de escutar depois de (Just talk) | Nunca, 15 s–2 min | Depois desse silêncio, espera a palavra de ativação ou um toque. |
| Modelo, Local confidence (tela do carro) | — | O modelo no celular e a confiança abaixo da qual um comando não roda (A6). |

## A4. Verificação de locutor

O app grava uma **assinatura de voz** do dono: você lê 5 frases curtas em voz alta (`SV_ONBOARDING_SAMPLE_COUNT` em
`src/appflow.ts`). Ela é salva em `Documents/sv_enrollment.json` e ligada **ao vivo** na palavra de ativação e no STT, então:

- a palavra de ativação só responde à voz cadastrada;
- cada resultado do STT diz quem falou (`speakerIds`, `speakerId`);
- **portas**: `open_door` e `unlock_car` só rodam quando a voz do dono foi verificada naquele pedido
  (`src/speaker_verification/currentSpeaker.ts`, `src/agent/LocalAgent.ts`).

Se uma amostra não é ouvida (cada uma pode levar até 60 s), a tela volta com um aviso; você pode tentar de novo ou pular.

## A5. O que dizer

- **Vidros:** "abre os vidros", "fecha o vidro de trás da direita", "abre o vidro do carona até a metade".
- **Clima:** "coloca vinte e dois", "dois graus mais quente", "vinte pro motorista e vinte e três pro passageiro", "ventilador no três".
- **Bancos, portas, mídia, navegação:** "liga o aquecimento do meu banco", "tranca o carro", "aumenta o volume", "me leva pra casa".
- **Dois comandos de uma vez:** "fecha os vidros e tranca o carro". **Desfazer:** "desfaz".
- **Continuações:** depois de "abre o vidro do motorista": "agora o do carona". **Incompleto:** "abre um vidro" → "Qual vidro?"
  (responda sem a palavra de ativação: foi uma pergunta).
- Em inglês funciona igual: "open the windows", "close it", "set the temperature to 22".

## A6. Como um pedido funciona (o agente do carro)

1. **Escopo.** Só comandos simples de carro chegam ao modelo; perguntas gerais recebem uma resposta curta
   (`general_questions.config.ts`), fala confusa é perguntada de novo, fala de fundo é ignorada.
2. **O modelo** escreve uma chamada de ferramenta (por exemplo `set_window {"window": "all", "position": "open"}`).
3. **Local confidence** (se ligada): uma chamada da qual o modelo não tem certeza suficiente nunca roda.
4. **Checagens.** Cada chamada é conferida com as suas próprias palavras antes de rodar (objeto errado, liga/desliga trocado,
   números que você não disse).
5. **O carro** executa a ação e a resposta é falada (`src/car/carTools.ts`).

O estado do modelo: um checkpoint de teste. Em 128 frases que ele nunca viu, 86% dos comandos de carro terminaram exatamente na ação
certa e 2 turnos executaram uma ação errada; é uma prévia do pipeline, não a precisão final.

## A7. Mudanças comuns

| Para mudar | Onde |
|---|---|
| **A palavra de ativação** | `modelName` em `src/wakeword/index.ts`. No app: `hey_davoice_model_28_06042026.dm` (padrão), `hello_davoice_model_28_17082026.dm`, `hey_coach_model_28_22012026b.dm`. Um modelo novo vai em `assets/models/` **e** em `android/app/src/main/assets/` **e** no projeto iOS (Copy Bundle Resources). Sensibilidade: `threshold` / `bufferCnt` em `instanceConfigs`. Coloque as variações dela em `SOUNDS_LIKE` em `src/conversation/wakePhrase.ts` (veja B5.4). |
| Padrões da conversa | `DEFAULT_CONVERSATION_SETTINGS` em `src/conversation/settings.ts` |
| Palavras que o STT deve preferir | `assets/stt_bias_conf/words_flattened.txt` (e `.pt-BR.txt`): uma frase por linha, terminando com vírgula. Novo build. |
| Roteamento de áudio (rota do iOS, ducking, cancelamento de eco) | `defaultAudioRoutingConfig` em `src/wakeword/index.ts` |
| Idiomas e vozes | `language_packs.json`; vozes e velocidades em `src/tts/index.ts` |
| Verificação de locutor | número de amostras e limiar em `src/appflow.ts`; frases em `src/speaker_verification/enrollmentSentences.ts` |
| O que o carro faz e diz | `src/car/carTools.ts`. Mantenha `src/car/carToolDefinitions.h3d.json` como está: é o texto com que o modelo foi treinado. |
| Persona e mensagens do agente | `agent_automotive/agent.json` (`pt-BR/` para português) |
| Perguntas gerais | `general_questions.config.ts` |
| A lista de modelos | `src/local_llm/constants.ts` |

## A8. Onde está o código

| Parte | Arquivos |
|---|---|
| Fluxo de início, telas | `App.tsx`, `src/redesign/` |
| Palavra de ativação, roteamento de áudio | `src/wakeword/index.ts` |
| Verificação de locutor | `src/speaker_verification/` |
| STT, TTS, vozes, pacotes de idioma | `src/stt/index.ts`, `src/tts/`, `src/initialization/index.ts` |
| **Modos de conversa** (quem escuta quando) | `src/conversation/` (TypeScript puro, sem dependências do app) |
| O agente, o modelo | `src/agent/`, `src/aichat/`, `src/local_llm/`, `agent_automotive/` |
| O carro simulado | `src/car/` |

---

# Parte B — Levar estes recursos para o seu app React Native

Cada seção funciona sozinha: pegue só o que precisar. A B5 junta tudo num fluxo completo de voz a voz.

## B0. Preparação (uma vez)

**1. Instalar**

```bash
npm install react-native-wakeword@1.1.171 react-native-davoice@1.0.142 react-native-fs
cd ios && pod install && cd ..
```

**2. Android: as bibliotecas nativas dos pacotes.** Em `android/build.gradle`:

```gradle
allprojects {
  repositories {
    maven { url "${project(":react-native-wakeword").projectDir}/libs" }
    maven { url "${project(":react-native-davoice").projectDir}/libs" }
  }
}
```

**3. Permissões.**
- Android: `RECORD_AUDIO` (peça em tempo de execução antes de iniciar qualquer coisa; `PermissionsAndroid.request`).
- iOS `Info.plist`: `NSMicrophoneUsageDescription` e `NSSpeechRecognitionUsageDescription`. Para escutar em segundo plano,
  também `UIBackgroundModes` → `audio`.

**4. Arquivos de modelo.**

| Arquivo | Onde |
|---|---|
| Palavra de ativação (ex.: `hey_davoice_model_28_06042026.dm`), verificação de locutor (`sv.dm`) | Android: `android/app/src/main/assets/`. iOS: no projeto Xcode (Copy Bundle Resources). Você se refere a eles pelo nome do arquivo. |
| Modelo de voz do TTS (ex.: um `model_ex2_*.dm`) | `require('./assets/models/<arquivo>.dm')`, ou o caminho do arquivo se for baixado. Coloque `'dm'` em `resolver.assetExts` do Metro (veja `metro.config.js`). |

**5. Licenças.** Uma para a palavra de ativação (`setKeywordDetectionLicense`), uma para a fala (`Speech.setLicense`). Peça em
info@davoice.io.

### As regras que fazem funcionar

Elas vêm de apps em produção. A maioria dos bugs de voz é uma regra quebrada.

1. **As pausas são leves; o microfone continua rodando.** Use só:
   - STT: `Speech.pauseSpeechRecognition()` / `Speech.unPauseSpeechRecognition(-1, preFetchMs, timeoutMs)`;
   - palavra de ativação: `pauseDetection(false)` / `unPauseDetection()`.

   **Nunca** use `Speech.stop()` ou `Speech.cancel()` para encerrar um turno: no Android o reconhecedor se reinicia sozinho e
   continua transcrevendo.
2. **Um ouvinte decide de cada vez.** Enquanto o STT escuta, a palavra de ativação fica pausada, a não ser que você a use para parar
   o agente (B5.6). Enquanto a palavra de ativação escuta, o STT fica pausado.
3. **Libere o microfone (`pauseDetection(true)` no Android) só para outro gravador**: o cadastro da verificação de locutor, a
   gravação para clonar uma voz. Pegue de volta depois com `unPauseDetection()`.
4. **O roteamento de áudio vem primeiro**: aplique a mesma configuração na palavra de ativação e no `Speech` **antes** de criar a
   palavra de ativação e antes do `Speech.initAll`.
5. **Ordem de início:** palavra de ativação criada e iniciada → pausada → `Speech.initAll` → STT pausado → palavra de ativação
   retomada.
6. **Pré-captura só depois da palavra de ativação** (2000 ms guardam "Hey DaVoice, abre o vidro" dito de uma vez), e depois
   **tire a palavra de ativação** antes de usar o texto (B5.4). Depois de uma resposta, um toque ou a palavra que para o agente:
   pré-captura **0** (senão a voz do próprio agente ou a palavra de parar volta para o turno novo).
7. **Ignore o que for ouvido fora da vez do usuário**: esperando a palavra de ativação, pensando, enquanto o agente fala (a não ser
   com Interrupt ligado). Callbacks atrasados acontecem.
8. **A verificação de locutor liga e desliga ao vivo** (`addSpeaker` / `setSpeakers([])`): sem reiniciar a palavra de ativação nem
   o STT.

## B1. Palavra de ativação

```ts
import { createKeyWordRNBridgeInstance, setWakewordAudioRoutingConfig } from 'react-native-wakeword';

const MODEL = 'hey_davoice_model_28_06042026.dm';        // in the native bundle (B0.4)

export async function createWakeWord(onWakeWord: (keyword: string) => void) {
  await setWakewordAudioRoutingConfig(audioRoutingConfig);        // rule 4 (B3 shows the config)
  const ww = await createKeyWordRNBridgeInstance('wakeword', false);
  await ww.createInstanceMulti([MODEL], [0.999], [3], [1000]);    // models, thresholds, buffer counts, ms between callbacks
  ww.onKeywordDetectionEvent((keyword: string) => onWakeWord(keyword));   // e.g. "Hey Davoice Model 28 06042026"
  if (!(await ww.setKeywordDetectionLicense(WAKEWORD_LICENSE))) throw new Error('wake word license');
  await ww.startKeywordDetection(0.999, true);
  return ww;
}
```

- **Pausar / retomar** (regra 1): `await ww.pauseDetection(false)` / `await ww.unPauseDetection()`.
- **Sensibilidade:** limiar (0–1, mais alto = menos disparos falsos) e número de buffers (quadros seguidos necessários). Este app
  usa 0,999 / 3.
- **Desligar:** `await ww.stopKeywordDetection(); await ww.destroyInstance();` e remova a inscrição do evento.
- **A frase para mostrar ao usuário:** o nome do arquivo do modelo sem `_model…` (`formatWakeWord` em `src/wakeword/index.ts` →
  "Hey DaVoice").
- **Só a palavra de ativação** (sem STT): isso é tudo; chame a sua ação em `onWakeWord`.

## B2. Cadastro da verificação de locutor (a assinatura de voz)

O usuário lê algumas frases; o resultado é um **JSON de cadastro** que você salva e liga depois (B4). Copie
`src/speaker_verification/onboarding.ts` (`runSpeakerVerifyEnrollment`), ou use este núcleo:

```ts
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import {
  createSpeakerVerificationMicController, onSpeakerVerificationOnboardingProgress,
  onSpeakerVerificationOnboardingDone, onSpeakerVerificationError,
} from 'react-native-wakeword';

export async function recordVoiceSignature(samples = 5, onProgress?: (collected: number) => void): Promise<string> {
  const ctrl = await createSpeakerVerificationMicController('svMic');
  const subs: Array<() => void> = [];
  try {
    await ctrl.create(JSON.stringify({
      modelPath: 'sv.dm',
      options: { decisionThreshold: Platform.OS === 'android' ? 0.34 : 0.35, tailSeconds: 2.0, frameSize: 1280,
                 maxTailSeconds: 3.0, cmn: true, expectedLayoutBDT: false },
    }));
    let collected = 0;
    let json: string | null = null;
    const done = new Promise<void>((resolve, reject) => {
      subs.push(onSpeakerVerificationOnboardingDone((e: any) => {
        if (e?.controllerId !== 'svMic') return;
        json = e.enrollmentJson ?? e.enrollment ?? e.json ?? null;
        resolve();
      }));
      subs.push(onSpeakerVerificationError((e: any) => e?.controllerId === 'svMic' && reject(new Error(String(e?.error)))));
    });
    await ctrl.beginOnboarding('davoice', samples, true);
    for (let i = 0; i < samples && !json; i++) {
      // show sentence i on screen, then wait for that sample (allow up to 60 s: people read slowly)
      const sample = new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('no sample')), 60000);
        const off = onSpeakerVerificationOnboardingProgress((e: any) => {
          if (e?.controllerId !== 'svMic' || Number(e?.collected) <= collected) return;
          collected = Number(e.collected); clearTimeout(t); off(); onProgress?.(collected); resolve();
        });
      });
      await ctrl.getNextEmbeddingFromMic();
      await Promise.race([sample, done]);
    }
    await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('no profile')), 30000))]);
    if (!json || (json as string).length < 10) throw new Error('empty enrollment');
    const path = `${RNFS.DocumentDirectoryPath}/sv_enrollment.json`;
    await RNFS.writeFile(path, json, 'utf8');
    return path;
  } finally {
    subs.forEach((off) => off());
    await ctrl.destroy();            // always: an open controller keeps recording and fights the wake word and STT
  }
}
```

**Em volta da gravação** (regras 1–3): STT pausado, e a palavra de ativação entrega o microfone ao gravador:

```ts
await Speech.pauseSpeechRecognition();
await ww.pauseDetection(Platform.OS === 'android');   // Android: release the microphone for the recorder
try {
  enrollmentPath = await recordVoiceSignature(5, setProgress);
} catch {
  // show the choice again with a notice ("Try again in a quiet place, or skip"), never "restart the app"
} finally {
  await ww.unPauseDetection();
}
```

- Mostre uma frase por amostra. Frases naturais que incluem a palavra de ativação funcionam melhor (`enrollmentSentences.ts`).
- No próximo início: se `sv_enrollment.json` existir, ofereça "Usar minha assinatura de voz salva" em vez de gravar de novo.

## B3. STT e TTS

**Início** (regras 4 e 5, depois que a palavra de ativação da B1 foi criada e iniciada):

```ts
import Speech from 'react-native-davoice/speech';

export const audioRoutingConfig = { /* copy defaultAudioRoutingConfig from src/wakeword/index.ts (iOS routes, ducking) */ };

await Speech.setAudioRoutingConfig(audioRoutingConfig);
if (!(await Speech.setLicense(SPEECH_LICENSE))) throw new Error('speech license');
await ww.pauseDetection(false);
await Speech.initAll({ locale: 'en-US', model: require('./assets/models/<your voice model>.dm') });   // or a downloaded file's path
await Speech.pauseSpeechRecognition();       // STT starts paused; the wake word decides when it opens
await ww.unPauseDetection();
```

**Escutar e pegar o texto**

```ts
await Speech.unPauseSpeechRecognition(-1, preFetchMs, 2500);   // -1: until paused; preFetchMs: see rule 6
Speech.onSpeechPartialResults = (e) => onHeard(e.value?.[0] ?? '');
Speech.onSpeechResults = (e) => onHeard(e.value?.[0] ?? '');
// ... when the user stopped talking (B5.3):
await Speech.pauseSpeechRecognition();
```

- **O fim da fala** é decisão sua: reinicie um timer a cada resultado parcial; quando ele acabar (2 s), o pedido está completo.
- **Android:** os resultados chegam em segmentos (o reconhecedor reinicia entre frases). Junte cada segmento novo ao texto até ali
  (`mergeSmartKeepPunct` em `src/stt/index.ts`), e ignore resultados parciais por ~400 ms depois de retomar (são de antes).
- **Palavras de dica:** o STT prefere as frases de `words_flattened.txt` (assets do Android / bundle do iOS; veja este app). Coloque
  a sua palavra de ativação e as palavras do seu domínio ali.

**Falar**

```ts
await Speech.changeVoice('Rich');            // a voice of the loaded model (Speech.getAllVoices())
Speech.onFinishedSpeaking = () => { /* everything queued has been spoken: the next turn (B5) */ };
await Speech.speak('I opened the driver window.', 0, 1.0);   // text, speaker id, speed; sentences queue up
await Speech.stopSpeaking();                 // stop now (interrupt / stop word)
```

- Fale respostas longas frase por frase conforme chegam: a primeira começa mais cedo.
- Não reescreva números nem nomes para a fala; a biblioteca de TTS faz isso.

## B4. Verificação de locutor com STT e a palavra de ativação

Ligue **ao vivo** (regra 8), com o caminho do JSON da B2:

```ts
const OWNER = 'owner';
await ww.addSpeaker(OWNER, enrollmentPath);       // the wake word answers only this voice
await Speech.addSpeaker(OWNER, enrollmentPath);   // STT results say who spoke
// off:
await ww.setSpeakers([]);
await Speech.setSpeakers([]);
```

(No início você também pode passar no `Speech.initAll({ ..., onboardingJsonPath: enrollmentPath, speakerId: OWNER })`.)

**Usando:** cada resultado do STT traz `speakerIds` / `speakerId` (só com a verificação ligada). Junte por pedido e confira antes de
uma ação sensível:

```ts
let heard = new Set<string>();
const note = (e: { speakerIds?: string[]; speakerId?: string }) => {
  (e.speakerIds ?? []).forEach((id) => heard.add(id));
  if (e.speakerId) heard.add(e.speakerId);
};
// in onSpeechPartialResults / onSpeechResults: note(e)
const ownerMayAct = () => heard.has(OWNER);       // e.g. unlock the doors only if true
// after each request: heard = new Set()
```

Isso é o `src/speaker_verification/currentSpeaker.ts`.

## B5. Um fluxo completo de voz a voz no seu app

### B5.1 Copiar

| Copie | Por quê |
|---|---|
| `src/conversation/controller.ts`, `bargeIn.ts`, `settings.ts`, `wakePhrase.ts`, `hint.ts` | a lógica dos turnos: quem escuta quando. TypeScript puro, sem dependências; a mesma lógica e os mesmos casos de teste dos apps Flutter e Android. |
| `src/conversation/ConversationSettingsPanel.tsx`, `ConversationBar.tsx`, `store.ts` (opcional) | a tela de configurações (rascunho + Save) e salvar as configurações |
| B1, B3 (e B2, B4 para a verificação de locutor) | os motores |

### B5.2 Os turnos

| Fase | STT | Palavra de ativação | Sai da fase quando |
|---|---|---|---|
| **asleep** (modo palavra de ativação) | pausado | escutando | a palavra de ativação → listening (pré-captura 2 s) |
| **listening** | escutando | pausada | silêncio depois da fala → busy; nada dito na janela de escuta → asleep |
| **busy** (pensando, depois falando) | pausado (modo Interrupt: aberto por baixo da voz) | pausada (palavra para parar ligada: escutando enquanto fala) | a resposta foi falada → uma pergunta: listening (pré-captura 0); senão → asleep |

No modo **just talk** não há fase asleep entre pedidos: depois de uma resposta, escuta de novo.

### B5.3 Ligar tudo

```ts
import { Platform } from 'react-native';
import Speech from 'react-native-davoice/speech';
import { ConversationController } from './conversation/controller';
import { DEFAULT_CONVERSATION_SETTINGS, endOfSpeechMs, type ConversationSettings } from './conversation/settings';
import { dropWakePhrase } from './conversation/wakePhrase';
import { conversationHint } from './conversation/hint';
import { mergeSmartKeepPunct } from './stt/merge';   // copy mergeSmartKeepPunct from src/stt/index.ts (Android segments)

const WAKE_PHRASE = 'Hey DaVoice';
let settings: ConversationSettings = DEFAULT_CONVERSATION_SETTINGS;
let transcript = '';
let silence: ReturnType<typeof setTimeout> | null = null;
let ignoreUntil = 0;           // Android: partial results right after an unpause
let fromWakeWord = false;      // this turn was opened by the wake word: strip the phrase (B5.4)
let spoken = '';               // what the agent said this turn (echo check, question check)

const conversation = new ConversationController(
  {
    openMic: async (preFetchMs) => {
      transcript = '';
      ignoreUntil = Date.now() + 400;
      await Speech.unPauseSpeechRecognition(-1, preFetchMs, 2500);
    },
    closeMic: async () => {
      if (silence) clearTimeout(silence);
      transcript = '';
      await Speech.pauseSpeechRecognition();            // gentle (rule 1)
    },
    armWakeWord: () => ww.unPauseDetection(),
    disarmWakeWord: () => ww.pauseDetection(false),
    stopReply: async () => { cancelYourAgent(); await Speech.stopSpeaking(); },
    onPhase: (phase) => showLine(conversationHint(phase, WAKE_PHRASE, settings.wakeWord)),  // "Say “Hey DaVoice” before each request"
  },
  settings,
);

// The conversation screen opens. Wake-word mode: it starts asleep (the wake word that opened the screen is not a request).
export async function startConversation() {
  if (!settings.wakeWord) await Speech.unPauseSpeechRecognition(-1, 0, 2500);
  conversation.enter();
}

// B1's callback
function onWakeWord() {
  fromWakeWord = true;
  conversation.wakeWord();       // asleep → listening (pre-fetch); while the agent speaks → stop word (if on); otherwise ignored
}

// B3's results
function onHeard(text: string) {
  text = text.trim();
  if (!text) return;
  if (Platform.OS === 'android' && Date.now() < ignoreUntil) return;
  if (conversation.phase === 'asleep' || conversation.phase === 'off') return;      // rule 7
  if (conversation.phase === 'busy' && !conversation.heardWhileBusy(text, spoken)) return;  // interrupt mode only
  conversation.userSpeech();
  transcript = Platform.OS === 'android' ? mergeSmartKeepPunct(transcript, text, 2) : text;
  if (silence) clearTimeout(silence);
  silence = setTimeout(endOfRequest, endOfSpeechMs(settings));
}

async function endOfRequest() {
  let text = transcript.trim();
  if (fromWakeWord && settings.wakeWord) {
    text = dropWakePhrase(text, WAKE_PHRASE);
    if (!text) return;           // only "Hey DaVoice" so far: wait for the request
  }
  fromWakeWord = false;
  transcript = '';
  await Speech.pauseSpeechRecognition();
  conversation.turnStarted();    // busy
  spoken = '';
  const reply = await yourAgent(text);        // your model, server or rules
  conversation.replySpeaking();  // interrupt mode opens STT under the voice; stop word on: the wake word listens
  spoken = reply;
  await Speech.speak(reply, 0, 1.0);
}

Speech.onFinishedSpeaking = () => conversation.replyFinished(spoken);   // a question → listening; otherwise → asleep

// Settings changed (Save): conversation.update(next) puts it to sleep at once when you switch to the wake word, and opens
// listening when you switch to just talk while asleep.
export function applySettings(next: ConversationSettings) {
  settings = next;
  conversation.update(next);
}

// A tap on the line: wakes it, or stops the agent and listens.
export const tapToTalk = () => conversation.tapToTalk();
// Leaving the screen: conversation.leave()  (the wake word listens again)
```

### B5.4 Pré-captura e a palavra de ativação

Com pré-captura, a transcrição normalmente começa com a palavra de ativação. `dropWakePhrase(text, phrase)` tira ela antes de o
texto ir para qualquer lugar: "Hey DaVoice, abre o vidro" → "abre o vidro". Também tira:

- só o fim da frase: "DaVoice, …", "The voice, …", "Voice …";
- como o STT escreve: "Hey the voice", "Hey da voice", "Hey devoice", "Hi DaVoice";
- a frase dita duas vezes;
- só a frase ("Hey DaVoice.", "Hey") → `''`: espere o pedido.

As palavras são comparadas inteiras ("Voicemail please" fica). Para a **sua** palavra de ativação, coloque as variações dela em
`SOUNDS_LIKE` em `wakePhrase.ts` (cada palavra → as sequências de palavras que o STT escreve para ela), e coloque a frase na lista de
dicas do STT (B3) para o STT escrever sempre do mesmo jeito. Tire ela também de qualquer texto que você processe antes
(por exemplo o prefill de um modelo com resultados parciais).

### B5.5 Depois da resposta

- **Modo palavra de ativação:** o STT reabre (pausa, depois retoma com pré-captura 0) **só se a resposta for uma pergunta**
  (`isQuestion` em `controller.ts`: termina com "?"), pela janela de resposta. Senão o STT fica pausado e a palavra de ativação
  escuta.
- **Just talk:** o STT reabre depois de cada resposta.

### B5.6 Palavra para parar e interromper

- **Palavra para parar** (`wakeWordMode.stopWord`, padrão desligado): a palavra de ativação escuta enquanto o agente fala; "Hey
  DaVoice" para a resposta (`stopReply`) e abre um turno novo com pré-captura 0. Ignore a palavra de ativação enquanto o agente
  ainda está pensando.
- **Interromper** (`interrupt`): o STT fica aberto por baixo da voz do agente. Palavras que o agente não está dizendo param ele;
  palavras que ele está dizendo são o eco dele (`bargeIn.ts`). Precisa de cancelamento de eco: no iOS,
  `routingConfigForConversation(audioRoutingConfig, settings)` coloca `AEC: { mode: 'always' }` no roteamento (aplique de novo na
  palavra de ativação e no `Speech`); no Android, `Speech.setAECEnabled(true)` onde houver suporte. Experimental no Android.

### B5.7 Lista de conferência

- [ ] Roteamento aplicado nos dois motores antes de iniciarem; ordem de início como na B3.
- [ ] Só pausas leves; nada de `Speech.stop()` / `cancel()` no fluxo.
- [ ] O modo palavra de ativação começa em asleep; a tela mostra "Say “…” before each request".
- [ ] Pré-captura só depois da palavra de ativação; a palavra de ativação é tirada; "só a frase" espera.
- [ ] Nada ouvido em asleep ou busy chega ao seu agente (a não ser com Interrupt).
- [ ] Depois de uma resposta: uma pergunta → listening; senão → a palavra de ativação.
- [ ] Verificação de locutor: o cadastro libera o microfone e sempre destrói o controlador; ligar é ao vivo.
- [ ] Teste num celular com os logs: cada mudança de fase aparece como `[Conversation] <fase>`.

### B5.8 Problemas comuns

| Sintoma | Causa |
|---|---|
| Responde sem a palavra de ativação | O STT abriu quando a tela abriu (regra 6), ou um resultado em asleep não foi ignorado (regra 7), ou foi usado `Speech.stop()` em vez de uma pausa (regra 1). |
| O pedido começa com "Hey DaVoice" / "the voice" | O turno não foi marcado como aberto pela palavra de ativação, ou faltam as variações da frase (B5.4). |
| O agente responde à própria voz | Interrupt sem cancelamento de eco, ou pré-captura > 0 depois de uma resposta. |
| Assinatura de voz: "no sample" | A palavra de ativação ainda segura o microfone (B2: `pauseDetection(true)` no Android), ou um lugar barulhento. |
| O primeiro pedido depois da palavra de ativação sai cortado | Pré-captura desligada, ou o timer de fim da fala curto demais. |

---

## Teste rápido (este app)

1. Instalação nova → Português do Brasil → escolha uma voz → pule a verificação de locutor.
2. "Hey DaVoice" → a tela do carro abre; a linha diz "Say “Hey DaVoice” before each request".
3. "Hey DaVoice, abre os vidros" (de uma vez) → vidros abertos; "Hey DaVoice, fecha eles" → fechados; "Hey DaVoice, desfaz" → volta.
4. "Hey DaVoice, abre um vidro" → "Qual vidro?" → responda sem a palavra de ativação.
5. Engrenagem → Just talk → Save → fale sem a palavra de ativação.
6. Back → tela da palavra de ativação → "Hey DaVoice" → a tela do carro de novo.
