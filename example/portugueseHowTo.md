# Guia em português: app de exemplo DaVoice (React Native)

> Para: outro agente Claude que vai usar, testar ou extrair partes deste app de exemplo
> (`example/`). Tudo aqui foi conferido no código. Os caminhos de arquivos são relativos à
> pasta `example/`. A versão em inglês está em `englishHowTo.md`.

O app demonstra um assistente de voz que roda no próprio aparelho:

- palavra de ativação (wake word);
- verificação de locutor (speaker verification / identificação do locutor);
- reconhecimento de fala (STT) e síntese de fala (TTS), com clonagem de voz;
- um chat de IA local (LLM no aparelho) com ferramentas: contador de calorias e um carro
  simulado (comandos automotivos).

Pacotes usados (`package.json`):

| Pacote | Para quê |
|---|---|
| `react-native-wakeword` | palavra de ativação + verificação de locutor (onboarding e verificação) |
| `react-native-davoice` | STT + TTS (`Speech`), clonagem de voz, filtro por locutor no STT |
| `react-native-davoice-llm` | LLM no aparelho, `Agent` (turno completo de assistente), ferramentas |
| `react-native-fs` | arquivos: assinatura de voz, modelos baixados, banco do agente |

---

## 1. Como usar o app em português, etapa por etapa

### 1.1 Rodar o app

```bash
cd example
npm install            # o projeto usa npm / package-lock.json
cd ios && pod install && cd ..
npx react-native run-android     # ou: npx react-native run-ios
```

- Em uma build *debug*, o JavaScript vem do Metro (`npx react-native start`). No Android,
  com o aparelho no USB: `adb reverse tcp:8081 tcp:8081`.
- Logs do JS no Android: `adb logcat | grep ReactNativeJS`.
- As chaves de licença DaVoice ficam no código do exemplo. Em outro app, use as suas
  (contato: info@davoice.io).

### 1.2 Fluxo de inicialização

1. **Idioma.** A primeira tela pergunta o idioma. Escolha **"Português do Brasil"**. Essa
   escolha define:
   - o modelo de TTS em português (`assets/models/model_ex2_portuguese_brv1.dm`);
   - o codificador de voz para clonagem (`assets/models/embedder_brv1.dm`);
   - o locale do STT (`pt-BR`);
   - o idioma das respostas do LLM;
   - o pacote do agente em português (`agent/pt-BR/`).

   Configuração: `APP_LANGUAGES` em `src/appflow.ts` e os mapas de modelo em
   `src/tts/index.ts`.
2. **Permissão de microfone.** Aceite.
3. **Carregamento.** O app carrega a wake word e o STT/TTS. No Android pode aparecer
   "Preparing voice demo..." por alguns segundos.
4. **Apresentação falada (em português).** A narração está em `src/narration.ts`, chave
   `'pt-BR'`.
5. **Escolha da voz.** Você pode:
   - escolher uma voz integrada;
   - escolher uma voz clonada que você já criou;
   - **clonar uma nova voz** a partir de uma gravação (`src/tts/voiceClone.ts`).
6. **Verificação do locutor** (detalhes em 1.3). Três opções: criar uma nova assinatura de
   voz, usar a assinatura salva ou pular.
7. **Palavra de ativação.** A narração diz "Agora diga a palavra de ativação…". A palavra
   deste exemplo é **"Hey Coach"** (modelo `hey_coach_model_28_22012026b.dm`). É uma frase
   em inglês, também no modo português.
8. **Escolha do modo**, depois da wake word:

| Modo | O que faz |
|---|---|
| **Local AI Chat** | STT → LLM no aparelho → TTS. Inclui calorias e o carro simulado. |
| Full AI Chat | STT → Gemini (nuvem) → TTS. Precisa de uma chave Gemini válida. |
| Combined STT + TTS | você fala e ouve o texto de volta |
| STT Only | só mostra a transcrição |
| Type to TTS | você digita e o app fala |

Para voltar à escolha de modo, use o botão de voltar do app (`goBackToModeSelection` em
`App.tsx`).

### 1.3 Verificação do locutor: configuração e por que ela importa

**O que é:** o app grava uma *assinatura de voz* do dono (enrollment) e depois compara
cada fala com essa assinatura.

**Como fazer o onboarding no app:**
1. Na etapa de verificação do locutor, escolha **criar uma nova assinatura**.
2. O app coleta **5 amostras** de fala (`SV_ONBOARDING_SAMPLE_COUNT` em `src/appflow.ts`).
   Fale frases naturais, uma por amostra, em ambiente silencioso, na distância normal de
   uso do telefone.
   - Sugestão (a do README, adaptada ao português): *"Hey Coach, por favor mande uma
     mensagem para o meu amigo. Como vai estar o tempo hoje? Coloca um timer de três
     minutos. Toca uma música pra mim. Toda manhã eu tomo um café olhando o nascer do sol."*
3. A assinatura é salva em `Documents/sv_enrollment.json`
   (`writeEnrollmentJsonToFile` em `src/speaker_verification/onboarding.ts`). Na próxima
   vez, escolha **usar a assinatura salva**.
4. Ao terminar, o app registra o locutor ao vivo na wake word **e** no STT
   (`applySpeakerVerificationChoice` em `App.tsx`):
   ```ts
   await wakewordInstance.addSpeaker(SV_SPEAKER_ID, enrollmentJsonPath); // react-native-wakeword
   await Speech.addSpeaker(SV_SPEAKER_ID, enrollmentJsonPath);           // react-native-davoice
   ```
   Se o usuário pular, o app chama `setSpeakers([])` nos dois. Uma lista vazia desliga o
   filtro.
5. Limiar de decisão: `SV_DECISION_THRESHOLD` em `src/appflow.ts` (0.34 no Android, 0.35
   no iOS).

**Por que isso importa, principalmente no carro.** Sem verificação, qualquer voz no
ambiente pode comandar o assistente: passageiro, rádio, alguém do lado de fora da janela.
Com a verificação ligada:
- a wake word só dispara com uma voz cadastrada;
- cada resultado do STT informa **quem** falou: `speakerIds` (todos os locutores
  verificados na frase) e `speakerId` (o último). Veja `SpeechResultsEvent` em
  `react-native-davoice`.

Para ações sensíveis, como "abre as portas", "destrava o carro", "abre o porta-malas" ou
um pagamento, a regra recomendada é: **executar só se o locutor verificado da frase for o
dono.** No `Agent` (`react-native-davoice-llm`) isso já tem um mecanismo:

1. Declare a ferramenta sensível com `execution.authorization` e um escopo:
   ```json
   {
     "name": "unlock_doors",
     "description": "Destrava as portas do carro.",
     "inputSchema": { "type": "object", "properties": {}, "required": [] },
     "execution": { "authorization": { "scope": "door_locks", "message": "Destravar as portas?" } }
   }
   ```
2. O núcleo do agente **nunca executa** essa ferramenta sem um "sim" do app. Ele envia um
   pedido `authorizeTool` para `onRequest` (veja `src/agent/LocalAgent.ts`). Responda com
   base no locutor verificado:
   ```ts
   const OWNER_ID = 'owner';       // o id usado em addSpeaker(OWNER_ID, enrollmentJsonPath)
   let lastSpeakerId: string | undefined;
   Speech.onSpeechResults = (e) => { lastSpeakerId = e.speakerId; /* ... */ };

   onRequest: async (request) => {
     if (request.type === 'authorizeTool') {
       const sensitive = request.scope === 'door_locks';
       return { authorized: !sensitive || lastSpeakerId === OWNER_ID };
     }
     if (request.type === 'confirmTool') return { confirmed: await askToConfirm(request) };
     // ...
   }
   ```
3. Para uma confirmação de "sim/não" (sem checar o locutor), use
   `execution.confirmation`. O exemplo faz isso em `send_message`: o app mostra um diálogo
   antes de enviar.

**Estado atual deste exemplo, para não haver confusão:**
- O carro simulado **não tem** ferramenta de portas ou travas. Pedidos assim são
  recusados como "não disponível".
- `AUTHORIZED_TOOL_SCOPES` em `src/agent/LocalAgent.ts` está **vazio**, então qualquer
  ferramenta que declare `authorization` é recusada.

O código acima é o padrão a implementar quando uma ferramenta sensível for adicionada.

### 1.4 Comandos de exemplo em português (Local AI Chat)

Diga "Hey Coach", espere o app ouvir e fale um dos comandos:

- **Carro (simulado):**
  - "abre a janela do passageiro"
  - "fecha todos os vidros"
  - "coloca o ar em vinte e dois graus"
  - "esquenta dois graus"
  - "ventilação no três"
  - "liga o desembaçador do para-brisa"
  - "toca Caetano Veloso"
  - "sintoniza noventa e oito vírgula cinco"
  - "aumenta o volume"
  - "me leva pra casa"
  - "quanto de autonomia eu tenho?"
- **Pedidos incompletos (o app deve perguntar):**
  - "abre a janela" → "Qual vidro você quer abrir?"
  - "liga o desembaçador" → "O vidro da frente ou o de trás?"
- **Calorias:**
  - "comi dois ovos"
  - "almocei um prato de arroz com feijão"
  - "quantas calorias hoje?"
  - "desfaz"
- **Conversa e conhecimento:**
  - "quem é você?" (resposta fixa do pacote `agent/pt-BR/agent.json`, `fixedReplies`)
  - "me conta uma história"
  - "me escreve um poema sobre o mar" ou "me conta uma curiosidade sobre o Brasil": o modelo passa
    adiante; sem modelo remoto configurado, o app responde com a mensagem de 2.2

---

## 2. O chat de IA local: o que esperar e como testar

### 2.1 Modelos e download

- **Seletor de modelos:** fica no modo Local AI Chat (`src/local_llm/ModelPicker.tsx`). A
  lista está em `src/local_llm/constants.ts`:
  - **"DaVoice Agent 0.6B (VW demo)"** (padrão e primeira opção): Qwen3-0.6B ajustado para
    decidir ferramentas, treinado também com comandos automotivos em português;
  - modelos genéricos maiores, como alternativa: Qwen2.5 1.5B/3B, Gemma 3n. Eles respondem
    tudo no próprio aparelho, mas são mais lentos.
- **Download:** cada modelo é baixado uma vez (o "DaVoice Agent" tem cerca de 380 MB) e
  conferido por sha256. Se o hash não bater, o arquivo é apagado. Use Wi-Fi.
- **Estados na tela:** download → "Warming up..." → "Ready". O aquecimento processa o prompt
  de sistema (persona + ferramentas de calorias e do carro, cerca de 3.300 tokens).
  - **Na primeira vez** leva cerca de **40 s** num Galaxy S20 (CPU). Depois, o app **salva
    esse estado em disco** (`*.kvstate` na pasta dos modelos, cerca de 380 MB) com
    `saveState` do `react-native-davoice-llm`.
  - **Nas próximas aberturas** o estado é restaurado (`loadState`) em cerca de um segundo, e
    o "Ready" chega logo.
  - O estado só é salvo de novo se o prompt mudar bastante (outras ferramentas, outro idioma).
    Código: `src/aichat/provider.ts` (`warmUp`) e `kvStatePath` em
    `src/local_llm/ModelManager.ts`.
- **Não fale antes do "Ready":** um comando dito durante o aquecimento espera o aquecimento
  terminar.

### 2.2 Como o turno funciona

- O modelo ajustado decide sozinho, a cada frase: chamar uma ferramenta (carro, calorias,
  memória, busca na web), perguntar (pedido incompleto), recusar (não suportado) ou
  **passar adiante** para um modelo remoto.
- **O que é passado adiante:** conhecimento geral, escrever um texto, papo, e às vezes em
  que o modelo pequeno não produz resposta. O modelo de 0,6B foi treinado para **agir**
  (ferramentas), não para conversar.
- **Modelo remoto: configuração atual.** Hoje **não há modelo remoto configurado**
  (`LOCAL_LLM_LAYER2 = 'none'` em `src/local_llm/constants.ts`). Tudo o que é passado adiante
  recebe esta resposta fixa, sem a frase de espera ("deixa eu ver…"):
  - em português: **"Preciso enviar isso para um modelo remoto. Para isso funcionar,
    configure um modelo remoto no aplicativo."**
  - em inglês: *"I need to send this to a remote Model. To make this work, please setup a
    remote model in the App."*

  O texto fica em `LOCAL_LLM_NO_REMOTE_MESSAGE` (`src/local_llm/constants.ts`) e é devolvido
  por `answerRemoteRequest` em `src/aichat/remote.ts`. Essa mensagem é **esperada** e não
  é erro: comandos do carro e das calorias continuam funcionando normalmente, sem internet.
- **Como configurar um modelo remoto.** Mude `LOCAL_LLM_LAYER2`:
  - `'cloud'`: o app envia o pedido ao Gemini (`src/aichat/remote.ts`, chave
    `GEMINI_API_KEY` em `local.config.ts`). O agente fala uma frase de espera enquanto
    aguarda; se o Gemini falhar, ele diz que não conseguiu.
  - Qualquer outro serviço (seu próprio servidor, outro LLM na nuvem): implemente
    `answerRemoteRequest` em `src/aichat/remote.ts`. Ele recebe o pedido (`query`,
    `userText`, histórico, fatos da memória, resultados das ferramentas) e devolve
    `{ text }`, ou `{ failure, detail }` em caso de erro.
  - `'device'`: um segundo modelo no aparelho (`LOCAL_LLM_LAYER2_MODEL`, o Qwen3 0.6B original,
    cerca de 470 MB). **Não recomendado:** os dois modelos disputam a mesma CPU, tudo fica bem
    mais lento, e o modelo pequeno às vezes misturava fatos da memória com pedidos de ação.
- **Busca na web:** Wikipedia por padrão. Tavily ou Brave exigem chave em
  `local.config.ts`.
- **Respostas faladas:** cada frase do texto é enviada ao TTS assim que fica pronta. O
  texto aparece na tela antes da voz.

### 2.3 O que esperar (honestamente)

- É um modelo de **0,6B parâmetros no telefone**. Ele escolhe a ferramenta certa na
  maioria das vezes, mas **erra argumentos com frequência**, por exemplo:
  - lado/zona errados ("janela do passageiro" → todas);
  - valor absoluto vs. relativo ("vinte e dois graus" vs. "sobe dois graus");
  - números falados.

  De vez em quando executa uma ação errada ou oposta. Por isso o carro é **simulado** e
  ações sensíveis precisam de `authorization` / `confirmation`.
- **Latência (Galaxy S20, só CPU):**
  - cerca de 5 s até a primeira palavra;
  - um comando do carro completo (chamada da ferramenta + "Pronto.") leva de 10 a 15 s.

  Em iPhones com Metal é bem mais rápido.
- **Memória do usuário:** com um fato salvo sobre o carro (por exemplo "meu carro é vermelho"),
  o modelo de 0,6B às vezes responde com o fato em vez de executar o pedido sobre o carro.
  É uma limitação conhecida do modelo atual.
- Pedidos fora do que o carro sabe fazer (portas, travas, faróis, freio de mão) devem ser
  **recusados**, não executados.

### 2.4 Como testar

1. Entre em **Local AI Chat**. O modelo **"DaVoice Agent 0.6B (VW demo)"** já é o padrão.
   Espere o "Ready" (cerca de 40 s na primeira vez; depois, segundos).
   - Para testar o estado salvo: feche o app por completo, abra de novo e volte ao Local AI
     Chat. O log mostra `[LocalLLM] KV state restored: N tokens in X ms`.
   - Faça também uma pergunta geral ("me conta uma curiosidade sobre o Brasil"): a resposta
     deve ser a mensagem do modelo remoto de 2.2.
2. **Cartões na tela:**
   - **Calorias** (`src/calories/CaloriesCard.tsx`): total do dia e lista.
   - **Carro** (azul, `src/car/CarCard.tsx`), logo abaixo:
     - a última ação em palavras e a **chamada exata** que a IA fez, por exemplo
       `set_window(window: passenger, position: open)`;
     - as duas ações anteriores;
     - uma linha com o estado do carro;
     - botão **"Parado / Em movimento"**: em movimento, o app recusa porta-malas,
       portinhola de recarga, girar a tela, abrir todos os vidros e alguns modos
       (`NOT_WHILE_DRIVING` em `src/car/carTools.ts`);
     - botão **"Reiniciar"**: zera o carro.
3. **O que verificar em cada comando:**
   - a ferramenta certa;
   - os argumentos exatos (lado, valor, unidade);
   - pergunta quando falta informação;
   - recusa quando não é suportado;
   - **nenhuma ação executada** em frases de conversa ("valeu", "show, ficou bom").
4. **Ferramentas registradas:** `LOCAL_LLM_CAR_TOOLS` em `src/local_llm/constants.ts`:
   - `'vw_demo'` (17 ferramentas, padrão: prompt menor e mais rápido);
   - `'all'` (o catálogo inteiro de 30).
5. **Log da conversa no aparelho (Android):**
   `adb shell run-as com.exampleapp cat files/davoice_chat.log`. Mostra o que o modelo
   gerou, as chamadas de ferramenta e os resultados.
6. **Com a verificação de locutor ligada:** confirme que a wake word não dispara com outra
   pessoa falando, e que `speakerId` aparece nos resultados do STT.

### 2.5 Conversa por turnos: o usuário espera a IA terminar

**Como funciona hoje.** O chat de IA (local e Gemini) é **por turnos**. O usuário **não
consegue interromper** a IA:

1. O usuário fala. Quando ele faz silêncio, o app envia a frase para a IA.
2. Nesse momento o STT é pausado (`Speech.pauseSpeechRecognition()` em `processAIChatTurn`,
   `App.tsx`). Enquanto `aiChatInFlightRef` está ligado, os resultados do STT são ignorados
   (`src/stt/index.ts`).
3. A IA pensa e fala a resposta, frase por frase.
4. Só depois que o último áudio termina, `finishAIChatSpeechFlow` reabre o microfone para o
   próximo turno.

Enquanto a IA pensa ou fala, nada do que o usuário diz é ouvido. Dizer "Hey Coach" também
não para a resposta, e não há botão de parar. Isso é proposital: é o jeito mais simples e
seguro de evitar que a IA escute a própria voz e transcreva o que ela mesma está falando.

**Se você quiser que o usuário possa interromper a IA, é preciso mudar o app.** O modelo
recomendado é o do app LunaFit (`../LunaFitTech.Mobileapp`), no modo de treino (workout):
lá o usuário diz "Hey Coach" por cima do treinador e o treinador para na hora. Arquivos de
referência no LunaFit:
- `src/components/utility-components/WakewordLibHeadless.ts` (`keywordCallback`);
- `src/components/utility-components/wakewordDetectionRouting.ts`
  (`resolveWakewordDetectionAction`);
- `src/components/ai-chat/SpeechLibHeadless.ts` (handler `COACH_BTN_STOP_PRESS`);
- `src/components/utility-components/audioRoutingConfigs.ts`.

O que o LunaFit faz, e como aplicar aqui:

1. **A wake word fica ouvindo enquanto a IA fala** (o STT continua fechado). No LunaFit,
   quando o turno do usuário termina, o STT fecha e a detecção da wake word volta
   (`unPauseDetection`) antes de o treinador falar. Aqui: chame
   `myInstanceRef.current?.unPauseDetection()` logo depois do `pauseSpeechRecognition()` em
   `processAIChatTurn`.
2. **Cancelamento de eco ligado sempre.** No LunaFit: `AEC: { mode: 'always' }` no
   `defaultAudioRoutingConfig`. Aqui o `defaultAudioRoutingConfig` em `src/wakeword/index.ts`
   usa `WakewordAEC: { regular: false, duringTTS: false }`. Troque por
   `AEC: { mode: 'always' }`, para que a voz da própria IA não dispare a wake word nem
   entre no STT. Suporte (documentado em `react-native-wakeword`, `audioRoutingConfig.d.ts`):
   - iPhones mais novos usam o AEC do próprio iOS; os mais antigos, um motor de áudio com
     cancelamento de eco;
   - no Android vale para a wake word e o TTS; para o STT, Android 13+ no alto-falante.
3. **Wake word durante a fala da IA = parar.** No LunaFit, `resolveWakewordDetectionAction`
   devolve `'stop-coach'` quando o treinador está falando, e isso tem prioridade sobre
   qualquer outro estado. Aqui, no começo do `keywordCallback` em `App.tsx`:
   ```ts
   if (aiChatInFlightRef.current) {             // a IA está pensando ou falando
     if (interruptInFlightRef.current) return;  // a mesma "Hey Coach" detectada duas vezes
     interruptInFlightRef.current = true;
     try {
       aiChatRequestIdRef.current += 1;         // textos e eventos atrasados do turno antigo são ignorados
       (await getLocalAgent()).cancel();        // para o turno do LLM (src/agent/LocalAgent.ts)
       aiChatSpeechQueueRef.current = [];       // descarta as frases que ainda não foram faladas
       ignoreNextFinishedSpeakingRef.current = true; // o "terminou de falar" do stop não abre outro turno
       await Speech.stopSpeaking();             // cala a voz agora
       resetSpeechTranscriptState();            // descarta o que o STT pegou no meio (não envia para a IA)
       aiChatInFlightRef.current = false;
       await myInstanceRef.current?.pauseDetection(false);
       await Speech.unPauseSpeechRecognition(-1, 0); // novo turno do usuário; preFetchMs 0, veja abaixo
     } finally {
       interruptInFlightRef.current = false;
     }
     return;
   }
   ```
   `interruptInFlightRef` e `ignoreNextFinishedSpeakingRef` são refs novos.
   `finishAIChatSpeechFlow` precisa respeitar o segundo e não reabrir o microfone de novo.
4. **Detalhes que o LunaFit aprendeu na prática:**
   - **Proteja contra detecção dupla** (o `coachStopInFlightRef` do LunaFit): a mesma
     palavra pode disparar duas vezes.
   - **Descarte a transcrição acidental, não envie.** Interromper a fala não pode mandar
     para a IA um pedaço de frase ou o eco da própria IA.
   - **Abra o STT com `preFetchMs: 0`.** Senão o STT repete os ~2 s de áudio anteriores e
     transcreve o "Hey Coach" (ou a voz da IA) como se fosse a nova mensagem.
   - **Botão vs. voz.** Num botão de parar, o LunaFit só faz silêncio. Pela wake word, ele
     abre o microfone, porque o usuário quer falar.
   - **Toque um som curto de "ouvindo"** quando o microfone abre, para o usuário saber que
     pode falar.
   - **Histórico:** guarde no histórico só o que a IA chegou a falar, para o próximo turno
     fazer sentido.
5. **No carro, combine com a verificação de locutor (1.3).** Com locutor cadastrado, só a
   voz do dono consegue interromper. O rádio ou um passageiro, não.

**Variante "qualquer fala interrompe" (duplex).** No LunaFit isso existe só numa tela de
conversa contínua ("Surprise Me", `AEC_DUPLEX_ROUTES` em `voiceRouteAudioPolicy.ts`) e
**só no iOS**. Lá o STT fica aberto por baixo da fala do treinador, com `AEC 'always'`.
Palavras que **não** são eco do que o treinador está dizendo param a fala e começam um turno
normal (`interruptCoachForUserSpeech` em `SpeechLibHeadless.ts`). É mais complexo, porque é
preciso filtrar o eco comparando a transcrição com a frase que a IA está falando. Para o
carro, a versão com wake word acima é mais segura.

---

## 3. Como extrair cada componente para outro app

Regra geral: copie o **módulo** de `src/` e os **assets** listados, instale o pacote e use
a sua licença. Os módulos de `src/` foram separados do `App.tsx` exatamente para isso (veja
`src/README.md`).

### 3.1 Palavra de ativação (`react-native-wakeword`)

- **Código:** `src/wakeword/index.ts`:
  - `instanceConfigs` (modelo, limiar, buffer);
  - `initializeWakewordBootstrap`, `startWakewordDetection`;
  - `attachKeywordListenerOnce` / `detachKeywordListener`;
  - `pauseDetection` / `unPauseDetection`.
- **API mínima:**
  ```ts
  import { createKeyWordRNBridgeInstance } from 'react-native-wakeword';
  const inst = await createKeyWordRNBridgeInstance('ww1', false);
  await inst.setKeywordDetectionLicense(LICENSE);
  await inst.createInstance('hey_coach_model_28_22012026b.dm', 0.999, 3);
  await inst.startKeywordDetection(0.999 /* ... */);
  ```
- **Assets:** o modelo `.dm` da palavra precisa estar no **bundle nativo**:
  - Android: `android/app/src/main/assets/hey_coach_model_28_22012026b.dm`;
  - iOS: adicionado ao projeto Xcode (Copy Bundle Resources), como neste exemplo.

  Para outra palavra de ativação, peça um modelo à DaVoice.
- **Antes do STT:** pause a wake word antes de abrir o STT (o exemplo faz isso). Dois
  pipelines de áudio abertos ao mesmo tempo causam instabilidade. A exceção é o padrão de
  interrupção de 2.5: a wake word ouve enquanto o TTS fala, com o STT fechado.

### 3.2 Onboarding e verificação de locutor (`react-native-wakeword` + `react-native-davoice`)

- **Código:**
  - `src/speaker_verification/onboarding.ts`: `runSpeakerVerifyEnrollment`,
    `runSpeakerVerificationStartupFlow`, `writeEnrollmentJsonToFile`,
    `loadEnrollmentJsonFromFile`;
  - `src/speaker_verification/verification.ts`: verificação contínua ou pontual;
  - `src/appflow.ts`: limiar e número de amostras.
- **Asset:** `sv.dm` no bundle nativo:
  - Android: `android/app/src/main/assets/sv.dm`;
  - iOS: no projeto Xcode.

  O controlador usa `modelPath: 'sv.dm'`.
- **Fluxo:**
  ```ts
  import { createSpeakerVerificationMicController, onSpeakerVerificationOnboardingDone } from 'react-native-wakeword';
  const ctrl = await createSpeakerVerificationMicController('svMic1');
  await ctrl.create(JSON.stringify({ modelPath: 'sv.dm', options: { decisionThreshold: 0.35 } }));
  await ctrl.beginOnboarding('davoice', 5, true);
  // 5x: await ctrl.getNextEmbeddingFromMic();  -> eventos de progresso; no fim, onboardingDone traz enrollmentJson
  // salve o JSON (react-native-fs) e registre o locutor:
  await wakewordInstance.addSpeaker('owner', enrollmentJsonPath);
  await Speech.addSpeaker('owner', enrollmentJsonPath);
  ```
- **No início do STT:** também dá para registrar o locutor já na inicialização:
  `Speech.initAll({ locale: 'pt-BR', model, onboardingJsonPath, speakerId: 'owner' })`.
- **Gerenciar a lista de locutores:**
  - `setSpeakers([...])` troca a lista inteira (vazia = desligado);
  - `removeSpeaker(id)` tira um locutor;
  - `getSpeakerIds()` lista os cadastrados.
- **Autorização de ações:** use `speakerId` / `speakerIds` dos resultados do STT. Veja o
  padrão de autorização em 1.3.

### 3.3 STT e TTS (`react-native-davoice`)

- **Código:**
  - `src/initialization/index.ts`: `initializeSpeechLibrary` (chama `Speech.initAll`),
    permissão de microfone;
  - `src/stt/index.ts`: handlers de resultado, junção de texto parcial/final;
  - `src/tts/index.ts`: modelo por idioma, vozes, velocidades;
  - `src/tts/voiceClone.ts`: clonagem de voz.
- **Assets para português** (`require` no JS, via Metro; `metro.config.js` já aceita
  `.dm`):
  - TTS: `assets/models/model_ex2_portuguese_brv1.dm` (cerca de 143 MB);
  - clonagem de voz: `assets/models/embedder_brv1.dm`.
- **API mínima:**
  ```ts
  import Speech from 'react-native-davoice/speech';
  await Speech.initAll({ locale: 'pt-BR', model: require('./assets/models/model_ex2_portuguese_brv1.dm') });
  Speech.onSpeechResults = (e) => console.log(e.value[0], e.speakerId);
  await Speech.unPauseSpeechRecognition(-1);   // começa a ouvir
  await Speech.pauseSpeechRecognition();       // antes de falar
  await Speech.speak('Pronto, abri a janela.', 0, 1.0);
  ```
- **Clonagem de voz:**
  `Speech.createVoiceClone(gravacao, pastaDeSaida + '/', require('./assets/models/embedder_brv1.dm'))`,
  depois `Speech.setExternalVoicesPath(pasta)` e `changeVoice(nome)`. Se a resposta trouxer
  `warnings`, peça ao usuário para gravar de novo.
- **Texto para a voz:** não reescreva o texto para a fala no app (números, domínios como
  "DaVoice.io"). A biblioteca de TTS já faz esse pré-processamento.

### 3.4 Chat de IA local e ferramentas (`react-native-davoice-llm`)

- **Instalação:**
  ```sh
  npm install react-native-davoice-llm
  cd ios && pod install
  ```
  No Android, adicione o repositório Maven do pacote em `android/build.gradle`:
  ```gradle
  allprojects { repositories { maven { url "${project(":react-native-davoice-llm").projectDir}/libs" } } }
  ```
- **Código para copiar:**
  - `src/local_llm/`: lista de modelos e URLs com sha256 (`constants.ts`), download e
    registro e estado salvo (`ModelManager.ts`, `ModelRegistry.ts`), carregamento
    (`LocalLLMLoader.ts`), seletor (`ModelPicker.tsx`);
  - `src/agent/LocalAgent.ts`: cria o `Agent` com o pacote do idioma, `onRequest`
    (pedidos `remote` para o modelo remoto, `authorizeTool`, `confirmTool`);
  - `src/aichat/remote.ts`: o modelo remoto (`answerRemoteRequest`: a mensagem fixa, o
    Gemini ou o seu serviço, veja 2.2);
  - `src/agent/AgentPack.ts`: escolhe `agent/` ou `agent/pt-BR/`;
  - `src/aichat/provider.ts`: configura o agente por modelo (ferramentas, modelo remoto,
    aquecimento, estado salvo com `saveState` / `loadState`) e faz o streaming para o TTS;
  - **pacote do agente:** `agent/pt-BR/agent.json` (persona, mensagens, respostas fixas,
    frases do modelo remoto) e `agent/pt-BR/skills/calories/` (`skill.json`, `foods.json`). São arquivos
    JSON: dá para mudar o comportamento sem mudar código;
  - **carro:** `src/car/carToolDefinitions.json` (definições das ferramentas no formato MCP:
    `name`, `description`, `inputSchema`, `execution`), `src/car/carTools.ts` (handlers),
    `src/car/CarState.ts` (estado simulado), `src/car/CarCard.tsx` (UI). Não dê o mesmo
    nome a um módulo `.ts` e a um arquivo `.json`: o Metro resolve o `.json` primeiro.
- **API mínima:**
  ```ts
  import { setLicense, loadModel, Agent } from 'react-native-davoice-llm';
  await setLicense(LICENSE);
  await loadModel(caminhoDoGguf, { contextSize: 8192 });
  const agent = await Agent.create({
    pack: { agent: require('./agent/pt-BR/agent.json'), skills: [/* {skill, data} */] },
    databasePath: `${RNFS.DocumentDirectoryPath}/davoice_agent_pt_br.db`,
    chatTemplate: 'qwen3',
  }, { onRequest });
  await agent.setTools(minhasFerramentas);          // ex.: as do carro
  const r = await agent.turn({ text, history }, (ev) => { if (ev.type === 'text') falar(ev.text); });
  // agent.cancel() para um turno em andamento (usado nas interrupções, veja 2.5)
  ```
- **Modelos:** baixe o GGUF pelas URLs de `src/local_llm/constants.ts` e confira o sha256
  (o exemplo já faz isso). Modelos ajustados precisam do mesmo `chatTemplate` (`qwen3`) e
  das configurações da entrada (`usesRouter: false`, `modelTools: true`,
  `remoteAssistant: true`).
- **Ferramentas novas:** um modelo pequeno depende muito do texto das descrições. Use
  descrições curtas e claras e diga explicitamente "absoluto vs. relativo" e qual lado é
  qual. Mantenha no app **o mesmo texto** com que o modelo foi treinado: o modelo de
  demonstração do carro espera as descrições de `src/car/carToolDefinitions.json`.

---

## Resumo rápido para testar em português

1. Instale e rode o app (1.1); escolha **Português do Brasil**.
2. Escolha uma voz; **crie a assinatura de voz** (5 frases); diga **"Hey Coach"**.
3. Escolha **Local AI Chat** (o modelo **VW demo** já é o padrão) → espere "Ready".
   Perguntas gerais recebem a mensagem "configure um modelo remoto" (veja 2.2).
4. Teste os comandos de 1.4 e confira o cartão azul do carro (ferramenta e argumentos
   exatos).
5. Lembre que o chat é por turnos (2.5): espere a IA terminar antes de falar de novo.
6. Teste também uma voz diferente: ela **não** deve ativar o assistente.
7. Para portas, travas ou pagamentos, implemente `execution.authorization` + checagem do
   `speakerId` (1.3) antes de qualquer ação real.
