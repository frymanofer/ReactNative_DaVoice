# Guia em português: app de exemplo DaVoice (React Native)

> Para: outro agente Claude que vai usar, testar ou extrair partes deste app de exemplo
> (`example/`). Tudo aqui foi conferido no código. Os caminhos de arquivos são relativos à
> pasta `example/`.

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
  - "qual é a capital da Austrália?" (respondida pela "camada 2", veja 2.2)

---

## 2. O chat de IA local: o que esperar e como testar

### 2.1 Modelos e download

- **Seletor de modelos:** fica no modo Local AI Chat (`src/local_llm/ModelPicker.tsx`). A
  lista está em `src/local_llm/constants.ts`:
  - **"DaVoice Agent 0.6B"** (padrão): modelo pequeno ajustado para decidir ferramentas;
  - **"DaVoice Agent 0.6B (VW demo ft7c-750)"**: versão de demonstração treinada com
    comandos automotivos em português. Aparece porque `LOCAL_LLM_VW_DEMO_MODEL = true`.
    Não é o padrão; escolha no seletor;
  - modelos genéricos maiores: Qwen2.5 1.5B/3B, Gemma 3n.
- **Download:** cada modelo é baixado uma vez (o "DaVoice Agent" tem cerca de 380 MB) e
  conferido por sha256. Se o hash não bater, o arquivo é apagado. Use Wi-Fi.
- **Estados na tela:** download → "Warming up..." → "Ready". O aquecimento já processa o
  prompt de sistema, então a primeira resposta sai mais rápida. Com as ferramentas do carro
  o prompt é grande, e o primeiro aquecimento demora mais.

### 2.2 Como o turno funciona

- O modelo ajustado decide sozinho, a cada frase: chamar uma ferramenta (carro, calorias,
  memória, busca na web), perguntar (pedido incompleto), recusar (não suportado) ou
  **passar adiante**.
- **Camada 2:** o que o modelo passa adiante (conhecimento geral, escrever um texto, papo)
  é respondido por um segundo modelo no aparelho, o **Qwen3 0.6B original, sem ajuste**
  (cerca de 470 MB, carregado em segundo plano depois do aquecimento). Configuração:
  `LOCAL_LLM_LAYER2 = 'device'` e `LOCAL_LLM_LAYER2_MODEL`. A alternativa é a nuvem
  (`'cloud'`, Gemini). Enquanto a camada 2 não carrega, o app diz que a resposta não está
  disponível.
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
- **Latência:** depende do aparelho. A primeira resposta após o aquecimento leva alguns
  segundos no Android, mais com o prompt grande do carro.
- Pedidos fora do que o carro sabe fazer (portas, travas, faróis, freio de mão) devem ser
  **recusados**, não executados.

### 2.4 Como testar

1. Entre em **Local AI Chat**. Se for testar o carro, escolha o modelo
   **"DaVoice Agent 0.6B (VW demo ft7c-750)"** no seletor. Espere o "Ready".
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
  pipelines de áudio abertos ao mesmo tempo causam instabilidade.

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
    registro (`ModelManager.ts`, `ModelRegistry.ts`), carregamento, incluindo a camada 2
    (`LocalLLMLoader.ts`), seletor (`ModelPicker.tsx`);
  - `src/agent/LocalAgent.ts`: cria o `Agent` com o pacote do idioma, `onRequest`
    (camada remota, `authorizeTool`, `confirmTool`);
  - `src/agent/AgentPack.ts`: escolhe `agent/` ou `agent/pt-BR/`;
  - `src/aichat/provider.ts`: configura o agente por modelo (ferramentas, camada 2,
    aquecimento) e faz o streaming para o TTS;
  - **pacote do agente:** `agent/pt-BR/agent.json` (persona, mensagens, respostas fixas,
    camada 2) e `agent/pt-BR/skills/calories/` (`skill.json`, `foods.json`). São arquivos
    JSON: dá para mudar o comportamento sem mudar código;
  - **carro:** `src/car/carToolDefinitions.json` (definições das ferramentas no formato MCP:
    `name`, `description`, `inputSchema`, `execution`), `src/car/carTools.ts` (handlers),
    `src/car/CarState.ts` (estado simulado), `src/car/CarCard.tsx` (UI).
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
3. Escolha **Local AI Chat** → modelo **VW demo** → espere "Ready".
4. Teste os comandos de 1.4 e confira o cartão azul do carro (ferramenta e argumentos
   exatos).
5. Teste também uma voz diferente: ela **não** deve ativar o assistente.
6. Para portas, travas ou pagamentos, implemente `execution.authorization` + checagem do
   `speakerId` (1.3) antes de qualquer ação real.
