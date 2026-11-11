# Guia em português: app de exemplo DaVoice (React Native)

> Para: outro agente Claude que vai usar, testar ou extrair partes deste app de exemplo
> (`example/`). Tudo aqui foi conferido no código (última atualização: 11/11/2026,
> `react-native-davoice-llm` 1.0.13). Os caminhos de arquivos são relativos à pasta
> `example/`. A versão em inglês está em `englishHowTo.md`.

> **Status: modelos de teste, ainda em treinamento.** O modelo da demo do carro, que roda no
> aparelho ("DaVoice Automotive Agent 0.6B", checkpoint `ft7f2_it900`), é **um modelo de
> teste, não um produto final**:
> - num Galaxy S20, com as ferramentas de carro do app, ele acerta por completo (ferramenta e
>   argumentos) cerca de **78% dos comandos de carro**, também em português do Brasil;
> - no nosso conjunto de teste mais novo e mais difícil, que o modelo nunca viu, acerta cerca
>   de **59%** dos comandos em português do Brasil.
>
> Às vezes confunde vidro com porta, recusa um comando que poderia fazer ou, raramente,
> executa uma ação errada. Por isso todas as ações do carro são **simuladas** e conferidas
> pelo app (guards, veja 2.3). Um Agente Automotivo dedicado está em treinamento (primeiro em
> português do Brasil); novos checkpoints só substituem este depois de passar nos testes de
> segurança. Considere os resultados uma prévia do pipeline de voz (wake word, verificação de
> locutor, STT/TTS, agente no aparelho), não a precisão final.

O app demonstra um assistente de voz que roda no próprio aparelho:

- palavra de ativação (wake word);
- verificação de locutor (speaker verification / identificação do locutor);
- reconhecimento de fala (STT) e síntese de fala (TTS), com clonagem de voz;
- duas demos de IA local (LLM no aparelho) com ferramentas:
  - **Demo do carro:** um carro Volkswagen simulado (vidros, portas, travas, ar-condicionado,
    navegação, rádio...);
  - **Demo de calorias:** contador de calorias e memória pessoal.

Pacotes usados (`package.json`):

| Pacote | Para quê |
|---|---|
| `react-native-wakeword` | palavra de ativação + verificação de locutor (onboarding e verificação) |
| `react-native-davoice` | STT + TTS (`Speech`), clonagem de voz, filtro por locutor no STT |
| `react-native-davoice-llm` (1.0.13) | LLM no aparelho, `Agent` (turno completo de assistente), ferramentas, guards de chamada |
| `react-native-fs` | arquivos: assinatura de voz, modelos baixados, estados de prompt salvos, banco do agente |

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
- **Build release no Android:** `cd android && ./gradlew :app:assembleRelease`.
  - `android/gradle.properties` dá 8 GB ao Gradle, o que o empacotamento do APK de ~1,5 GB
    precisa.
  - `android/app/build.gradle` refaz o bundle JS quando só os pacotes do agente (`agent/`,
    `agent_automotive/`) ou o JSON das ferramentas em `src/` mudam.
- Logs do JS no Android: `adb logcat | grep ReactNativeJS`.
- As chaves de licença DaVoice ficam no código do exemplo. Em outro app, use as suas
  (contato: info@davoice.io).

### 1.2 Fluxo de inicialização

1. **Idioma.** A primeira tela pergunta o idioma. Escolha **"Português do Brasil"**.
   - Também há Português de Portugal, inglês, alemão, espanhol, francês, italiano e
     holandês.
   - O hebraico tem suporte no código, mas está escondido nesta tela (`hidden: true` em
     `APP_LANGUAGES`). Os arquivos de TTS dele não vão no app: para voltar a oferecê-lo,
     restaure os dois `require()` marcados em `src/tts/index.ts` e tire o `hidden`.
   - A escolha define:
     - o modelo de TTS em português (`assets/models/model_ex2_portuguese_brv1.dm`);
     - o codificador de voz para clonagem (`assets/models/embedder_brv1.dm`);
     - o locale do STT (`pt-BR`);
     - o idioma das respostas do LLM;
     - o idioma do pacote do agente (`agent/pt-BR/`, e o mesmo em `agent_automotive/pt-BR/`).

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
| **Local AI · Car demo** | STT → Agente Automotivo no aparelho → TTS, com o carro simulado |
| **Local AI · Calories demo** | STT → Agente Pessoal no aparelho → TTS, com calorias e memória |
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

**Este exemplo já faz isso para as portas.** As ferramentas `open_door` e `unlock_car`
declaram um escopo de autorização em `src/car/carToolDefinitions*.json`:
```json
"execution": { "authorization": { "scope": "door_locks", "message": "Unlock the car?" } }
```
O núcleo do agente **nunca executa** uma ferramenta assim sem um "sim" do app. Ele envia um
pedido `authorizeTool` para `onRequest`, e `isToolAuthorized` em `src/agent/LocalAgent.ts`
responde com `ownerMayAct()` (`src/speaker_verification/currentSpeaker.ts`):
- verificação de locutor **desligada** (pulada): liberado (é uma demo);
- verificação **ligada**: liberado só se o dono cadastrado foi verificado nesse pedido. Outra
  voz recebe "não autorizado", e nada abre.

Outros escopos são recusados, a não ser que estejam em `AUTHORIZED_TOOL_SCOPES` (vazio). Para
uma confirmação simples de "sim/não", sem checar o locutor, a ferramenta declara
`execution.confirmation`; o exemplo faz isso em `send_message`, com um diálogo antes de
enviar.

### 1.4 Comandos de exemplo em português

Diga "Hey Coach", espere o app ouvir e fale um dos comandos:

- **Demo do carro:**
  - vidros: "abre o vidro traseiro direito", "fecha o vidro do carona", "abre o vidro da
    frente do lado esquerdo até a metade", "fecha todos os vidros", "abre os vidros de trás";
  - portas e travas: "abre a porta traseira esquerda", "fecha as portas", "tranca o carro",
    "destranca a porta do motorista";
  - ar-condicionado: "coloca o ar em vinte e dois graus", "esquenta dois graus", "deixa o lado
    do passageiro em vinte", "coloca 20 graus pro motorista e 23 pro passageiro",
    "ventilação no três", "liga o desembaçador do para-brisa";
  - mídia: "toca Caetano Veloso", "sintoniza noventa e oito vírgula cinco", "aumenta o
    volume";
  - navegação: "me leva pra casa", "quanto tempo falta?", "acha um posto no caminho";
  - estado do carro: "quanto de autonomia eu tenho?".
- **Pedidos incompletos (o app deve perguntar):**
  - "abre a janela" → "Qual janela você quer abrir?";
  - "liga o desembaçador" → "O da frente ou o de trás?".
- **Demo de calorias:**
  - "comi dois ovos";
  - "almocei um prato de arroz com feijão";
  - "quantas calorias hoje?";
  - "desfaz".
- **Conversa e conhecimento (nas duas demos):**
  - "quem é você?" (resposta fixa do pacote, `fixedReplies`);
  - "o que você pode fazer no carro?" (lista fixa das funções do carro);
  - "me conta uma curiosidade sobre o Brasil": o modelo passa adiante; sem modelo remoto
    configurado, o app responde com a mensagem de 2.2.

---

## 2. As demos de IA local: o que esperar e como testar

### 2.1 As duas demos, os modelos e a tela de carregamento

| | Demo do carro | Demo de calorias |
|---|---|---|
| Modelo (padrão) | **DaVoice Automotive Agent 0.6B** | **DaVoice Personal Agent 0.6B** |
| Pacote do agente (prompt de sistema) | `agent_automotive/` (sem a skill de calorias) | `agent/` + `agent/skills/calories/` |
| Ferramentas | o carro simulado (`src/car/`, 22 ferramentas) | calorias, memória, busca na web |
| Cartão | Cartão do carro | Cartão de calorias |
| Banco de dados | `davoice_agent*_car.db` | `davoice_agent*.db` |

- **Implementação:** `src/local_llm/demo.ts` guarda a demo atual, e
  `LOCAL_LLM_DEMO_DEFAULT_MODEL` em `src/local_llm/constants.ts` define o modelo de cada demo.
  - Demo do carro: **DaVoice Automotive Agent 0.6B (r4b)**, `LOCAL_LLM_DAVOICE_AUTOMOTIVE_R4B`
    (checkpoint `r4b_it100`, cerca de 380 MB, baixado uma vez e conferido por sha256).
  - Demo de calorias: o Personal Agent, ainda `ft7f2_it900`.
- **Outros modelos:** cada demo lembra a sua escolha feita em **Change** (seletor de modelos,
  `src/local_llm/ModelPicker.tsx`). O seletor também lista o ft7e (o padrão de produção,
  `LOCAL_LLM_DEFAULT_MODEL`), o ft7c (reserva), a entrada experimental do it900, o Agente
  Automotivo anterior `ft7f2_it900`, os checkpoints experimentais C3 e A (reservas: não
  hospedados, só quando o arquivo é copiado para a pasta de modelos) e modelos genéricos
  maiores (Qwen2.5 1.5B/3B, Gemma 3n). Os maiores são mais lentos.
  - Só um modelo fica na memória por vez: escolher outro substitui o atual.
  - A escolha anterior de uma demo vale mais que um novo padrão: num aparelho em que outro
    modelo foi escolhido na demo do carro, escolha o r4b em **Change** (ou limpe os dados do
    app).
- **Tela de carregamento:** ao escolher uma demo, o app mostra uma tela própria de
  carregamento com três etapas até o modelo ficar pronto:
  1. Download (barra de progresso);
  2. Carregar na memória;
  3. Aquecimento.

  Ela mostra os segundos de cada etapa e, em caso de erro, Retry e Back.
- **Tela da conversa:** só no "Ready" o app passa para uma tela limpa com:
  - o estado do carro (ou o cartão de calorias) no alto;
  - **You said** (o STT ao vivo);
  - **Reply** (o que é falado);
  - o nome do modelo com **Change**;
  - Reset Chat e Back.
- **Aquecimento e estado salvo:** o aquecimento processa o prompt de sistema (persona +
  ferramentas: cerca de 3.100 tokens na demo do carro e cerca de 4.000 na de calorias).
  - **Na primeira vez** de cada demo e idioma leva cerca de **30–40 s** num Galaxy S20 (CPU).
    Depois, o app **salva esse prompt processado** (`*.kvstate` na pasta dos modelos, cerca
    de 435 MB) com `saveState` do `react-native-davoice-llm`.
  - **Nas próximas vezes** o estado é restaurado (`loadState`) em **menos de um segundo**, e o
    "Ready" chega logo. Medido no S20: restauração em 0,7–0,9 s, aquecimento em 0,5–0,6 s.
  - Os estados são guardados **por prompt** (demo, idioma, ferramentas): os 2 mais recentes
    por arquivo de modelo. Trocar de demo é rápido depois do primeiro aquecimento de cada uma.
  - Um novo dia ainda paga parte do aquecimento, porque a data fica perto do começo do prompt.
  - Código: `warmUp` em `src/aichat/provider.ts`; `kvStatePath` e `stablePromptKey` em
    `src/local_llm/ModelManager.ts`.

### 2.2 Como o turno funciona

- O modelo ajustado decide sozinho, a cada frase: chamar uma ferramenta, perguntar (pedido
  incompleto), recusar (não suportado) ou **passar adiante** para um modelo remoto.
- **O app diz o que foi feito.** Depois de uma ação no carro o modelo não fala: a frase da
  própria ferramenta, montada a partir do resultado real, é dita e o turno termina. Código:
  `done()` / `say` em `src/car/carTools.ts`, enviados com `toolReply`. A frase diz a ação, a
  posição, a zona e o valor, em português ou inglês:
  - sucesso: "Abri o vidro traseiro direito." / "Coloquei o lado do motorista em 20°C e o do
    passageiro em 23°C.";
  - já estava assim: "A porta dianteira direita já está trancada.";
  - recusado pelo carro: "O carro está trancado. Quer que eu destranque?", "Não posso fazer
    isso com o carro em movimento." Nada muda, e o modelo nunca age sozinho depois de uma
    recusa (antes ele destrancava o carro por conta própria);
  - consultas (horário de chegada, autonomia, pneus) são respondidas pelo app com os valores.

  Nada é anunciado antes de a ferramenta confirmar.
- **O que é passado adiante:** conhecimento geral, escrever um texto, papo. O modelo de 0,6B
  foi treinado para **agir** (ferramentas), não para conversar.
- **Modelo remoto: configuração atual.** **Não há modelo remoto configurado**
  (`LOCAL_LLM_LAYER2 = 'none'` em `src/local_llm/constants.ts`).
  - Tudo o que é passado adiante recebe esta resposta fixa: **"Preciso enviar isso para um
    modelo remoto. Para isso funcionar, configure um modelo remoto no aplicativo."** O texto
    fica em `LOCAL_LLM_NO_REMOTE_MESSAGE`.
  - Um pedido que o modelo entendeu, mas que a demo não faz, recebe
    `LOCAL_LLM_NOT_IN_DEMO_MESSAGE`: "Isso não está disponível nesta demonstração. Para
    disponibilizar, entre em contato com info@davoice.io".

  Essas mensagens são **esperadas**, não erros.
- **Como configurar um modelo remoto.** Mude `LOCAL_LLM_LAYER2`:
  - `'cloud'`: o app envia o pedido ao Gemini (`src/aichat/remote.ts`, chave
    `GEMINI_API_KEY` em `local.config.ts`). O agente fala uma frase de espera enquanto
    aguarda; se o Gemini falhar, ele diz que não conseguiu.
  - Qualquer outro serviço: implemente `answerRemoteRequest` em `src/aichat/remote.ts`. Ele
    recebe o pedido (`query`, `userText`, histórico, fatos da memória, resultados das
    ferramentas) e devolve `{ text }`, ou `{ failure, detail }` em caso de erro.
  - `'device'`: um segundo modelo no aparelho (`LOCAL_LLM_LAYER2_MODEL`, cerca de 470 MB).
    **Não recomendado:** os dois modelos disputam a mesma CPU.
- **Ruído do reconhecimento de fala:** transcrições curtas que são só preenchimento ("The.",
  "Mas.", "é...", "Alma Alma.") recebem "Desculpe, não entendi. Pode repetir?" sem passar pelo
  modelo. Na demo do carro, um "Pronto." solto do modelo é trocado do mesmo jeito, já que as
  ações de verdade são confirmadas pela frase do próprio app. Código:
  `src/aichat/fragments.ts`.
- **Busca na web** (demo de calorias): Wikipedia por padrão. Tavily ou Brave exigem chave em
  `local.config.ts`.
- **Respostas faladas:** cada frase do texto é enviada ao TTS assim que fica pronta. O texto
  aparece na tela antes da voz.

### 2.3 O que esperar (honestamente)

- É um modelo de **0,6B parâmetros no telefone**. Ele escolhe a ferramenta certa na maioria
  das vezes, mas ainda erra, por exemplo:
  - em inglês, "open the windows" às vezes escolhe a ferramenta da porta;
  - lado ou zona errados;
  - valor absoluto vs. relativo ("vinte e dois graus" vs. "sobe dois graus");
  - números falados.
- **Os guards do núcleo** conferem cada chamada com as palavras do usuário antes de executar
  (`callGuards: 'correct'` na entrada do modelo). Eles:
  - corrigem um argumento claramente errado: "fecha" vs. "abre", "levanta o vidro" = fechar,
    "desliga o desembaçador", o lado que o usuário disse, um número partido;
  - normalizam um valor escrito em outra ordem ("right front" → `front_right`);
  - **bloqueiam** uma chamada para o tipo errado de objeto, por exemplo a ferramenta de porta
    para um vidro, com um natural "Desculpe, acho que não entendi direito. Pode repetir?". Uma
    chamada bloqueada **nunca** vira outra ferramenta;
  - bloqueiam uma chamada cujos argumentos são de outra ferramenta;
  - mantêm a ação numa correção que só muda o alvo: "fecha o vidro traseiro esquerdo" → "não,
    o outro de trás" fecha o traseiro direito (`followUp`; precisa de `historyAsRun: true` na
    entrada do modelo, para o histórico mostrar cada chamada como ela rodou).

  Toda decisão de guard aparece no log (`guard ...`).
- **Posições:** vidros, portas e travas aceitam `front_left`, `front_right`, `rear_left`,
  `rear_right`, `driver`, `passenger`, `front`, `rear`, `left`, `right` ou `all`.
  - `driver` / `passenger` são resolvidos pelo app a partir do lado do volante do carro
    (`CarState.vehicle.steering`, padrão esquerdo; `setSteering()` em `src/car/CarState.ts`),
    então nada supõe volante à esquerda.
  - Mover o vidro, abrir a porta e travar a porta são ferramentas separadas.
- **Duas temperaturas de uma vez:** `set_dual_zone_temperature` (motorista + passageiro). O app
  confere cada valor e diz qual lado não conseguiu ajustar. O r4b foi treinado nela e acerta a
  maioria dos pedidos com duas temperaturas, em qualquer ordem ("o carona quer 26 e eu 19").
  Um pedido de um lado só ("lado do passageiro em 22") usa `set_temperature` com uma zona.
  - Chega com o `react-native-davoice-llm` 1.0.14 (núcleo g11): um guard `dualZone` coloca os
    valores que o usuário disse nos lados certos da chamada dupla e bloqueia (pede de novo) uma
    chamada que perderia ou copiaria um lado. Ele nunca troca uma ferramenta por outra.
- **Valores fora da faixa** ("coloca o ventilador no 12"; o ventilador vai de 1 a 7): com o
  1.0.13 o usuário ouve o genérico "pode repetir?". A partir do 1.0.14, as frases do pacote
  `outOfRange` / `outOfRangeAsk` (já em `agent_automotive/agent.json` e `pt-BR/`) dizem a
  faixa: "Desculpe, 12 não dá: vai de 1 a 7."; um número que o usuário não disse é
  perguntado.
- **Latência (Galaxy S20, só CPU, medida em 10/11/2026):**
  - a decisão do modelo leva cerca de 1,3–2 s por comando;
  - a frase da ação é falada logo em seguida.

  Em iPhones com Metal é mais rápido.
- **Memória do usuário (demo de calorias):** um fato salvo às vezes aparece numa resposta que
  não tem nada a ver. É uma limitação conhecida do modelo atual.
- Pedidos que o carro não sabe fazer (capô, porta-malas, pisca-alerta, limpador, retrovisor,
  freio de mão) devem ser **recusados**, não executados.

### 2.4 Como testar

1. Escolha **Local AI · Car demo** (ou Calories). Espere a tela de carregamento terminar:
   cerca de 30–40 s na primeira vez, cerca de um segundo depois.
   - Para testar o estado salvo: feche o app por completo, abra de novo e volte à demo. O log
     mostra `[LocalLLM] KV state restored: N tokens in X ms`.
   - Faça uma pergunta geral ("me conta uma curiosidade sobre o Brasil"): a resposta deve ser
     a mensagem do modelo remoto de 2.2.
2. **Cartão do carro** (`src/car/CarCard.tsx`):
   - a última ação em palavras e a **chamada exata** que a IA fez, por exemplo
     `set_window(window: rear_right, position: open)`;
   - as duas ações anteriores;
   - uma linha com o estado do carro: temperatura por lado, vidros, portas abertas, travas;
   - botão **"Parado / Em movimento"**: em movimento, o app recusa porta-malas, portinhola de
     recarga, girar a tela, abrir todos os vidros, abrir portas e alguns modos
     (`NOT_WHILE_DRIVING` em `src/car/carTools.ts`);
   - botão **"Reiniciar"**: zera o carro.

   Na demo de calorias, o cartão de calorias (`src/calories/CaloriesCard.tsx`) mostra o total
   do dia e a lista.
3. **O que verificar em cada comando:**
   - a ferramenta certa;
   - os argumentos exatos (posição, valor, unidade);
   - a frase falada bate com o que aconteceu ("já está…", recusas);
   - pergunta quando falta informação;
   - recusa quando não é suportado;
   - **nenhuma ação executada** em frases de conversa ou em ruído de fala.
4. **Ferramentas registradas:** `LOCAL_LLM_CAR_TOOLS` em `src/local_llm/constants.ts`:
   - `'vw_demo'` (padrão: 22 ferramentas na redação h3, prompt menor e mais rápido);
   - `'all'` (o catálogo inteiro).

   O `toolWording` da entrada do modelo escolhe o arquivo de descrições:
   - `h3` (`src/car/carToolDefinitions.h3.json`: posições + duas zonas, gerado por
     `Davoice_LLM_Training/tools/make_h3_schemas.py`);
   - `h2`;
   - `v1` (a redação original, para o ft7c antigo).
5. **Log da conversa:**
   - build debug: `adb shell run-as com.exampleapp cat files/davoice_chat.log`;
   - build release: `adb logcat | grep DavoiceChat` (mesmo conteúdo).

   Mostra as palavras do usuário, o que o modelo gerou, as decisões dos guards, as chamadas
   de ferramenta e os resultados, a resposta, e linhas `[timing]` com os tempos de prompt e
   de geração.
6. **Testes do app:**
   ```sh
   npx jest __tests__/carTools.test.ts __tests__/fragments.test.ts
   ```
   Eles conferem as frases faladas do carro (sucesso / já estava / recusado, em português e
   inglês, posições, lado do volante, duas zonas) e as regras de ruído de fala.
7. **Com a verificação de locutor ligada:** confirme que a wake word não dispara com outra
   pessoa falando, que `speakerId` aparece nos resultados do STT, e que outra voz não
   consegue destrancar o carro.

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
  - `src/speaker_verification/currentSpeaker.ts`: quem foi verificado neste pedido,
    `ownerMayAct()` (usado para autorizar as ferramentas de porta, 1.3);
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
- **Autorização de ações:** use `speakerId` / `speakerIds` dos resultados do STT. Veja a
  autorização das portas em 1.3.

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
  - Todo `require()` de um arquivo `.dm` coloca o arquivo no app, mesmo que esse código nunca
    rode. Tire o `require()` de um idioma que você não oferece (é assim que o hebraico ficou
    de fora).
- **API mínima:**
  ```ts
  import Speech from 'react-native-davoice/speech';
  await Speech.initAll({ locale: 'pt-BR', model: require('./assets/models/model_ex2_portuguese_brv1.dm') });
  Speech.onSpeechResults = (e) => console.log(e.value[0], e.speakerId);
  await Speech.unPauseSpeechRecognition(-1);   // começa a ouvir
  await Speech.pauseSpeechRecognition();       // antes de falar
  await Speech.speak('Abri a janela.', 0, 1.0);
  ```
- **Clonagem de voz:**
  `Speech.createVoiceClone(gravacao, pastaDeSaida + '/', require('./assets/models/embedder_brv1.dm'))`,
  depois `Speech.setExternalVoicesPath(pasta)` e `changeVoice(nome)`. Se a resposta trouxer
  `warnings`, peça ao usuário para gravar de novo.
- **Texto para a voz:** não reescreva o texto para a fala no app (números, domínios como
  "DaVoice.io"). A biblioteca de TTS já faz esse pré-processamento.

### 3.4 IA local e ferramentas (`react-native-davoice-llm`)

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
  - `src/local_llm/`:
    - lista de modelos e URLs com sha256, mais o modelo padrão de cada demo
      (`constants.ts`);
    - a demo atual (`demo.ts`);
    - download, registro com um modelo por demo e os estados salvos (`ModelManager.ts`,
      `ModelRegistry.ts`);
    - carregamento (`LocalLLMLoader.ts`) e seletor (`ModelPicker.tsx`).
  - `src/agent/LocalAgent.ts`: cria o `Agent` com o pacote da demo e do idioma, `onRequest`
    (`remote`, `authorizeTool`, `confirmTool`). Também tem `resetLocalAgent()` para trocar de
    demo.
  - `src/agent/AgentPack.ts`: escolhe `agent/` ou `agent/pt-BR/`, e o pacote do carro
    (`automotiveAgentFor`).
  - `src/aichat/remote.ts`: o modelo remoto (`answerRemoteRequest`: as mensagens fixas, o
    Gemini ou o seu serviço, veja 2.2).
  - `src/aichat/provider.ts`: configura o agente por modelo (ferramentas, guards, modelo
    remoto, aquecimento, estado salvo por prompt com `saveState` / `loadState`) e faz o
    streaming para o TTS.
  - `src/aichat/fragments.ts`: regras de ruído de fala.
  - **Pacotes do agente** (arquivos JSON: dá para mudar o comportamento sem mudar código):
    - `agent/pt-BR/agent.json` + `agent/pt-BR/skills/calories/` (a demo de calorias);
    - `agent_automotive/pt-BR/agent.json` (a demo do carro: a mesma persona e as mesmas
      mensagens, sem a skill de calorias). Este é o prompt de sistema com que o modelo
      automotivo é treinado: mantenha-o igual quando usar esse modelo.
  - **Carro:**
    - `src/car/carToolDefinitions.h3.json` (definições das ferramentas no formato MCP:
      `name`, `description`, `inputSchema`, `execution`);
    - `src/car/carTools.ts` (handlers e as frases faladas);
    - `src/car/positions.ts` (posições, lado do volante, redação das frases);
    - `src/car/CarState.ts` (estado simulado);
    - `src/car/CarCard.tsx` (UI).

    Não dê o mesmo nome a um módulo `.ts` e a um arquivo `.json`: o Metro resolve o `.json`
    primeiro.
- **API mínima:**
  ```ts
  import { setLicense, loadModel, Agent, toolReply } from 'react-native-davoice-llm';
  await setLicense(LICENSE);
  await loadModel(caminhoDoGguf, { contextSize: 8192 });
  const agent = await Agent.create({
    pack: { agent: require('./agent_automotive/pt-BR/agent.json'), skills: [] },
    databasePath: `${RNFS.DocumentDirectoryPath}/davoice_agent_pt_br_car.db`,
    chatTemplate: 'qwen3',
  }, { onRequest });
  await agent.configure({ intentRouter: false, webSearchTool: true, timeTool: true, guards: { /* veja provider.ts */ } });
  await agent.setTools(minhasFerramentas);   // um handler devolve toolReply(resultado, 'Abri a janela.') para falar ele mesmo
  const r = await agent.turn({ text, history }, (ev) => { if (ev.type === 'text') falar(ev.text); });
  // agent.cancel() para um turno em andamento (usado nas interrupções, veja 2.5)
  ```
- **Modelos:** baixe o GGUF pelas URLs de `src/local_llm/constants.ts` e confira o sha256
  (o exemplo já faz isso). Modelos ajustados precisam do mesmo `chatTemplate` (`qwen3`) e
  das configurações da entrada (`usesRouter: false`, `modelTools: true`,
  `remoteAssistant: true`, `temperature: 0`, `callGuards: 'correct'`, `toolWording`; no
  Agente Automotivo também `historyAsRun: true` e `guidedToolCalls: true`). O `provider.ts` as
  envia para `agent.configure` (`historyAsRun`, `guidedToolCalls`, `promptOrder` e os
  `guards`, incluindo `followUp`, e `dualZone` a partir do 1.0.14).
- **Ferramentas novas:** um modelo pequeno depende muito do texto das descrições. Use
  descrições curtas e claras e diga explicitamente "absoluto vs. relativo" e qual lado é
  qual. Mantenha no app **o mesmo texto** com que o modelo foi treinado: o modelo da demo do
  carro espera `src/car/carToolDefinitions.h3.json`.

---

## Resumo rápido para testar em português

1. Instale e rode o app (1.1); escolha **Português do Brasil**.
2. Escolha uma voz; **crie a assinatura de voz** (5 frases); diga **"Hey Coach"**.
3. Escolha **Local AI · Car demo** → espere a tela de carregamento (cerca de 30–40 s na
   primeira vez, cerca de 1 s depois). Perguntas gerais recebem a mensagem "configure um
   modelo remoto" (veja 2.2).
4. Teste os comandos de 1.4. Confira o cartão do carro (ferramenta e argumentos exatos) e se
   a frase falada bate com o que aconteceu.
5. Teste a **Local AI · Calories demo** do mesmo jeito.
6. Lembre que o chat é por turnos (2.5): espere a IA terminar antes de falar de novo.
7. Teste também uma voz diferente: ela **não** deve ativar o assistente, nem destrancar o
   carro.
