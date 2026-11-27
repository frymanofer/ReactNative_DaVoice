# Third-party notices

## The on-device LLM (only if you use `react-native-davoice-llm` (npm))

The DaVoice LLM library (its iOS framework (`DavoiceLLM.xcframework`) and Android library (`llm-1.0.0.aar`)) includes code from the following open-source projects: llama.cpp / ggml
and JSON for Modern C++ under the MIT License, and SQLite (in the iOS framework only), which is in the public domain. The open models the
apps can download, and their licenses, are listed in [MODEL_NOTICES.md](MODEL_NOTICES.md).

### llama.cpp / ggml

https://github.com/ggml-org/llama.cpp

```
MIT License

Copyright (c) 2023-2026 The ggml authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Parts of ggml carry their own MIT copyright notices, reproduced here:

- `ggml/src/ggml-cpu/llamafile/sgemm.cpp`: Copyright 2024 Mozilla Foundation.
- YaRN RoPE scaling (`ggml/src/ggml-cpu/ops.cpp`, `ggml/src/ggml-metal/kernels/rope.metal`):
  Copyright (c) 2023 Jeffrey Quesnelle and Bowen Peng.

Each is licensed under the same MIT License terms as above.

### JSON for Modern C++ (nlohmann/json)

https://github.com/nlohmann/json

```
MIT License

Copyright (c) 2013-2025 Niels Lohmann

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### SQLite

https://sqlite.org

SQLite is in the public domain (https://sqlite.org/copyright.html); no license is required.
