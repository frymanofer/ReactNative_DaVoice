# Model and Voice Asset Notice

The application source code is MIT-licensed.

The included models, voice embeddings, and related assets are provided for
evaluation, local testing, experimentation, and non-commercial proof-of-concept
applications based on this example.

You may build and test internal or non-commercial POCs with these assets,
subject to the permissions applicable to each model.

Commercial deployment, resale, redistribution, or inclusion of these models or
voice assets in a commercial product requires separate written permission or a
commercial license.

Do not publish, extract, reverse engineer, decompile, disassemble, modify,
repackage, or redistribute the model files or voice assets. Do not use them
for training or to create derivative models unless expressly permitted.

The MIT license for the example source code does not apply to the model files
or voice assets. Model-specific permissions control where they impose
additional requirements or restrictions.

## The on-device LLM (only if you use `react-native-davoice-llm` (npm))

This section applies to the apps and features that use the on-device LLM: `example_car_agent` (the car agent) and the Local AI Chat in `example` and `expo`. Apps that use only
the wake word, speaker verification, speech to text or text to speech do not download these models. Each app
downloads only the models you pick.

| Model | Downloaded from | License |
|---|---|---|
| DaVoice Automotive Agent 0.6B, DaVoice Agent 0.6B | DaVoice (download) | Fine-tuned and quantized derivatives of [Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B) by the Qwen team (Alibaba Cloud), [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0). DaVoice fine-tuned them for in-car and assistant commands and quantized them to q4_0; the DaVoice changes and weights are covered by the terms above. |
| Qwen3-0.6B (q4_0) | DaVoice (download) | [Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B), Qwen team (Alibaba Cloud), [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0), quantized to q4_0. |
| Qwen2.5 1.5B Instruct | Hugging Face (Qwen) | [Apache 2.0](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE). |
| Qwen2.5 3B Instruct | Hugging Face (Qwen) | [Qwen Research License](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE): **non-commercial research use only**. Do not use it in a commercial product. |
| Gemma 3n E2B, Gemma 3n E4B | Hugging Face (GGUF conversion by unsloth) | Gemma is provided under and subject to the Gemma Terms of Use found at [ai.google.dev/gemma/terms](https://ai.google.dev/gemma/terms), including the [Gemma Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy). |
| Router embedding model (all-MiniLM-L6-v2, Q8_0) | DaVoice (download) | [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) by the Sentence Transformers project, [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0), converted to GGUF. |
| A model you add by URL in the model picker | wherever you download it | Its own license. You are responsible for following it. |

The licenses of the open base models apply to those models. Third-party code inside the LLM library is listed
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
