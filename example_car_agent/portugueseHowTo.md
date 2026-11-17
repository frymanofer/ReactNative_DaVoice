# Guia: o exemplo DaVoice Car Agent (React Native)

> Para quem (desenvolvedor, testador ou outro agente) vai rodar, testar ou copiar partes deste exemplo. Os caminhos são relativos
> a `example_car_agent/`. A versão em inglês está em `englishHowTo.md`. Última atualização: 17/11/2026,
> `react-native-davoice-llm` 1.0.15.

O app é um assistente de voz para carro que roda no próprio celular: palavra de ativação, verificação de locutor,
reconhecimento de fala (STT), o **DaVoice Automotive Agent** (um modelo de linguagem de 0,6B no aparelho que transforma o que foi
dito em ações do carro) e síntese de fala (TTS). O carro é **simulado** (o cartão na tela). Este exemplo não controla um veículo
de verdade.

> **Situação: modelo de teste.** O modelo do agente ("DaVoice Automotive Agent 0.6B", checkpoint `g3c_it3639`) ainda está em
> treinamento. Num conjunto lacrado de 128 frases novas, nunca vistas por ele (rodado uma única vez, português do Brasil e
> inglês):
> - **86%** dos comandos do carro (92 de 107) terminaram exatamente na ação certa;
> - **2 de 128** turnos executaram uma ação errada (uma temperatura sem o lado do motorista, a ventilação baixada em 2 em vez de
>   ficar no nível 2); **nenhuma ação oposta** ("abrir" no lugar de "fechar") e **nenhuma ação não suportada**;
> - fala de fundo e fragmentos nunca viraram ação; 6 comandos completos receberam "pode repetir" em vez da ação.
>
> Trate como uma prévia do pipeline de voz completo, não como a precisão final. Toda ação do carro é conferida antes de rodar (2.2).

Pacotes (`package.json`):

| Pacote | Para quê |
|---|---|
| `react-native-wakeword` | palavra de ativação + verificação de locutor |
| `react-native-davoice` | STT + TTS (`Speech`), clonagem de voz, filtro de locutor no STT |
| `react-native-davoice-llm` (1.0.15) | o modelo no aparelho, `Agent` (um turno completo do assistente), ferramentas, verificações das chamadas, Confiança local |
| `react-native-fs` | arquivos: assinatura de voz, vozes e modelos baixados, estados de prompt salvos, o banco de dados do agente |

---

## 1. Usando o app

### 1.1 Rodar

```bash
cd example_car_agent
npm install                     # npm / package-lock.json; não precisa de Git LFS: nenhum modelo de voz vem dentro do app
cd ios && pod install && cd ..
npx react-native run-android    # ou: npx react-native run-ios
```

- Builds de *debug* pegam o JavaScript do Metro (`npx react-native start`). Android no USB: `adb reverse tcp:8081 tcp:8081`.
- Build release Android: `cd android && ./gradlew :app:assembleRelease`.
- O app instala como **DaVoice Car Agent** (`com.exampleapp.caragent`), ao lado do exemplo completo da DaVoice.
- Logs JS no Android: `adb logcat | grep ReactNativeJS`; o log do próprio agente (cada saída do modelo, verificação e resposta):
  `adb logcat | grep DavoiceChat`.
- As chaves de licença da DaVoice estão no código do exemplo. No seu app, use as suas (info@davoice.io).

### 1.2 Fluxo de abertura

Não há narração falada nem menu: o app vai direto de um passo para o outro.

1. **Idioma.** Inglês, Português do Brasil, Português de Portugal, alemão, grego, espanhol, francês, italiano, holandês,
   dinamarquês ou sueco. **Todo idioma é baixado na primeira vez que é escolhido** (cerca de 136–170 MB: o modelo de voz e o
   codificador de clonagem); o botão mostra "⬇ N MB" e uma tela de download mostra o progresso. O idioma define o locale do STT,
   as vozes, o idioma das respostas do agente e o pacote do agente (`agent_automotive/` ou `agent_automotive/pt-BR/`).
2. **Permissão do microfone.** Aceite.
3. **Voz.** Escolha uma voz pronta, uma voz que você clonou antes, ou **clone uma nova voz** a partir de uma gravação.
4. **Verificação de locutor** (1.3): crie uma assinatura de voz, use a salva, ou pule.
5. **Palavra de ativação.** Diga **"Hey Coach"** (modelo `hey_coach_model_28_22012026b.dm`, a mesma em todos os idiomas). Num build
   de debug, o botão **Continue without wake word (dev)** faz o mesmo sem falar.
6. **O agente do carro abre.** Na primeira vez, ele baixa o modelo (382 MB) e um estado pré-aquecido do seu idioma (cerca de
   430 MB) numa única barra de progresso; depois disso o agente fica pronto em menos de um segundo. Fale o comando depois de
   cada resposta.

**Back** volta para a tela da palavra de ativação; o próximo "Hey Coach" abre o agente do carro de novo. **Reset Chat** começa
uma conversa nova.

### 1.3 Verificação de locutor

O app grava uma **assinatura de voz** do dono (5 amostras, `SV_ONBOARDING_SAMPLE_COUNT` em `src/appflow.ts`; fale frases
naturais num lugar silencioso) e a salva em `Documents/sv_enrollment.json`. Ela é cadastrada na palavra de ativação **e** no STT,
então:
- a palavra de ativação só dispara para a voz cadastrada;
- todo resultado do STT diz quem falou (`speakerIds`, `speakerId`).

Limiar de decisão: `SV_DECISION_THRESHOLD` em `src/appflow.ts` (0,34 Android, 0,35 iOS).

**Portas:** `open_door` e `unlock_car` declaram um escopo de autorização (`"door_locks"` em
`src/car/carToolDefinitions.h3d.json`). O agente nunca as executa sem um "sim" do app: `isToolAuthorized` em
`src/agent/LocalAgent.ts` só permite quando o dono cadastrado foi verificado neste pedido (ou quando a verificação foi pulada,
porque é uma demonstração).

### 1.4 O que dizer

- **Vidros:** "abre os vidros", "fecha o vidro do carona", "abaixa os vidros de trás", "abre o vidro do passageiro até a metade"
  / "open the windows".
- **Clima:** "coloca o ar em vinte e dois", "vinte graus pro carona", "coloca 20 pro motorista e 23 pro passageiro",
  "ventilador no três", "liga o desembaçador" / "set the temperature to 22".
- **Bancos:** "liga o aquecimento do banco do motorista", "ventila o banco do carona" / "turn on my seat heating".
- **Portas e travas:** "tranca o carro", "fecha as portas", "abre a porta traseira esquerda" / "lock the car".
- **Mídia e navegação:** "sintoniza noventa e oito ponto cinco", "aumenta o volume", "me leva pra Campinas", "acha um posto no
  caminho", "quanto tempo falta?" / "take me to Campinas".
- **Dois comandos de uma vez:** "fecha os vidros e tranca o carro" / "close the windows and lock the car".
- **Desfazer:** "desfaz" / "undo" volta o que o último comando mudou.
- **Continuações:** depois de "abre o vidro do motorista": "agora o do carona", "fecha ele" / "now the passenger one".
- **Pedidos incompletos:** "abre um vidro" → "Qual vidro?".
- **Fora do carro** ("me fala do Brasil"): vai para o assistente remoto. Este exemplo não tem um configurado
  (`LOCAL_LLM_LAYER2 = 'none'` em `src/local_llm/constants.ts`), então o app avisa.

---

## 2. O agente do carro

### 2.1 A tela do carro

| Elemento | O que mostra / faz |
|---|---|
| Cartão do carro | o estado do carro simulado (temperatura, ventilação, vidros, travas, volume, ...) e a última ação |
| You said / Reply | o que o STT ouviu e a resposta do agente (também falada) |
| Model · Change | o modelo no aparelho: **DaVoice Automotive Agent 0.6B** (`g3c_it3639`); dá para adicionar o seu próprio GGUF |
| Local confidence · Change | Off → 0,80 → 0,90 → 0,95 (2.3) |
| Reset Chat / Back | conversa nova / volta para a tela da palavra de ativação |

### 2.2 Como um turno funciona

1. **Escopo.** Só comandos de carro diretos chegam ao modelo (até 10 palavras; até 15 quando claros; até 22 para um pedido de
   carro claro). Perguntas gerais vão para o assistente remoto, fala truncada ou vaga é perguntada de novo, funções do carro sem
   ferramenta são recusadas, fala de fundo é ignorada. Configuração: `scope` em `src/local_llm/constants.ts`.
2. **O modelo** escreve uma chamada de ferramenta (por exemplo `set_window {"window": "all", "position": "open"}`), com as
   ferramentas do carro no prompt (`src/car/carToolDefinitions.h3d.json`, a redação com que o modelo foi treinado).
3. **Confiança local** (se ligada): uma chamada da qual o modelo não tem certeza suficiente não roda (2.3).
4. **Verificações.** Toda chamada é conferida com as palavras do próprio usuário antes de rodar: objeto errado (portas no lugar
   de vidros), inversões de liga/desliga e abre/fecha, zonas, números que o usuário não disse, valores fora da faixa. Uma
   chamada com a ferramenta errada ganha mais uma tentativa sem aquela ferramenta; senão, o usuário é perguntado. Configuração:
   `callGuards: 'correct'` e `guardRetry` em `src/local_llm/constants.ts`.
5. **O carro** (`src/car/carTools.ts`) executa a ação no carro simulado e a resposta é falada.

A parte fixa do prompt (prompt do sistema + ferramentas) é processada uma vez e salva; o **estado pré-aquecido** baixado com o
modelo é esse estado salvo, então o primeiro turno não espera uns 30 segundos. Um estado pré-aquecido só serve para o modelo,
pacote do agente, ferramentas e configurações de prompt exatos com que foi feito.

### 2.3 Confiança local

Cada chamada tem uma probabilidade: o produto das probabilidades dos tokens que o modelo escolheu. Com a Confiança local ligada,
uma chamada abaixo do valor **não** roda; o pedido vai para o assistente remoto ou, sem um configurado, o app diz **"Para esse
comando eu preciso de um agente remoto."** / **"For this command I need a remote agent."**

Medido com `g3c_it3639` em comandos que ele nunca viu no treinamento:

| Valor | Ações erradas evitadas | Comandos válidos enviados para fora |
|---|---|---|
| Off (padrão) | 0% | 0% |
| 0,80 | cerca de 40% | cerca de 13% |
| 0,90 | cerca de dois terços | cerca de 20% |
| 0,95 | cerca de 70% | cerca de 27% |

Mesmo em 0,95 algumas chamadas erradas saem com confiança alta, então sozinha ela não chega a zero. Código: as opções e a
mensagem em `src/local_llm/constants.ts`, o valor salvo em `src/local_llm/ModelRegistry.ts`, a chamada
`configure({confidence: {min}})` em `src/aichat/provider.ts`, a mensagem em `src/aichat/remote.ts`.

### 2.4 O que é baixado

Só a palavra de ativação (`android/app/src/main/assets/hey_coach_model_28_22012026b.dm`) e o modelo de verificação de locutor
(`sv.dm`) vêm dentro do app. Todo o resto vem do Cloudflare R2 da DaVoice (`https://pub-27f94b1602c647ab95a601086cf52820.r2.dev`)
na primeira vez que é preciso, e cada arquivo é conferido por sha256.

| O quê | De | Para | Quando |
|---|---|---|---|
| Modelo de voz + codificador de clonagem do idioma escolhido | `language-packs/<arquivo>` | `Documents/language_packs/<idioma>/` | quando o idioma é escolhido |
| O modelo do agente do carro (GGUF, 382 MB) | `agent-llm/<arquivo>` | `Documents/local_llm/models/` | quando o agente do carro abre pela primeira vez |
| Estado pré-aquecido em inglês ou português do Brasil (cerca de 430 MB) | `agent-llm/prewarm/<arquivo>` | ao lado do modelo | junto com o modelo |

- Idiomas: `language_packs.json` (`"bundled": []` = todos os idiomas são baixados). O `metro.config.js` o transforma em
  `src/tts/languagePacks.generated.ts` a cada bundle.
- Modelos e estados pré-aquecidos: `src/local_llm/constants.ts` (`url`, `sizeBytes`, `sha256`, `prebuiltStates`).

---

## 3. Onde está o código

| Parte | Arquivos |
|---|---|
| Fluxo de abertura, telas, palavra de ativação → agente do carro | `App.tsx`, `src/wakeword/index.ts`, `src/initialization/index.ts` |
| Verificação de locutor | `src/speaker_verification/` |
| STT / TTS, vozes, clonagem, pacotes de idioma | `src/stt/index.ts`, `src/tts/` |
| O agente e o pacote dele | `src/agent/LocalAgent.ts`, `src/agent/AgentPack.ts`, `agent_automotive/` |
| Carregamento do modelo, aquecimento, turnos | `src/aichat/provider.ts`, `src/local_llm/` |
| O carro simulado | `src/car/` (ferramentas, estado, cartão, desfazer) |

## Checklist rápido de teste

1. Instalação nova → escolha Português do Brasil → o pacote do idioma baixa → escolha uma voz → pule a verificação de locutor.
2. "Hey Coach" (ou o botão de dev) → o agente do carro abre; na primeira vez o modelo e o estado pré-aquecido são baixados.
3. "abre os vidros" → todos os vidros abrem; "fecha eles" → fecham; "desfaz" → voltam.
4. "coloca 20 pro motorista e 23 pro passageiro" → os dois lados ajustados.
5. "abre um vidro" → o agente pergunta qual.
6. Confiança local → 0,90; fale alguns comandos: os incertos não rodam e o app diz que precisa de um agente remoto.
7. Back → tela da palavra de ativação → "Hey Coach" → o agente do carro de novo.
