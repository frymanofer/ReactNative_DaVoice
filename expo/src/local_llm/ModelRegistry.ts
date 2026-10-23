import RNFS from 'react-native-fs';
import type { LocalLLMModelConfig, ModelId } from './types';
import {
  BUILTIN_LOCAL_LLM_MODELS,
  LOCAL_LLM_DEFAULT_MODEL,
  LOCAL_LLM_STORAGE_DIR,
} from './constants';

// The list of models the user can choose from: the built-ins in constants.ts
// plus any the user added, and which one is selected. Persisted as one small
// JSON file so the choice survives app restarts. Each model carries its own
// chat template, so switching models also switches the prompt format.

interface RegistryFile {
  selectedModelId: ModelId;
  customModels: LocalLLMModelConfig[];
}

function registryDir(): string {
  return `${RNFS.DocumentDirectoryPath}/${LOCAL_LLM_STORAGE_DIR}`;
}

function registryPath(): string {
  return `${registryDir()}/model_registry.json`;
}

let cached: RegistryFile | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function readRegistry(): Promise<RegistryFile> {
  if (cached) return cached;
  let file: RegistryFile = { selectedModelId: LOCAL_LLM_DEFAULT_MODEL, customModels: [] };
  try {
    if (await RNFS.exists(registryPath())) {
      const parsed = JSON.parse(await RNFS.readFile(registryPath(), 'utf8')) as Partial<RegistryFile>;
      file = {
        selectedModelId: parsed.selectedModelId ?? LOCAL_LLM_DEFAULT_MODEL,
        customModels: Array.isArray(parsed.customModels) ? parsed.customModels : [],
      };
    }
  } catch (error) {
    // A corrupt settings file must not block the chat; fall back to defaults.
    console.log('[LocalLLM] model registry unreadable, using defaults:', error);
  }
  cached = file;
  return file;
}

/** Updates the in-memory copy immediately and serializes disk writes, so
 * back-to-back changes (e.g. add then select) can't land out of order. */
async function writeRegistry(update: (current: RegistryFile) => RegistryFile): Promise<void> {
  const next = update(await readRegistry());
  cached = next;
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      if (!(await RNFS.exists(registryDir()))) await RNFS.mkdir(registryDir());
      await RNFS.writeFile(registryPath(), JSON.stringify(next), 'utf8');
    });
  return writeChain;
}

export async function listModels(): Promise<LocalLLMModelConfig[]> {
  const { customModels } = await readRegistry();
  return [...BUILTIN_LOCAL_LLM_MODELS, ...customModels];
}

export async function getModel(id: ModelId): Promise<LocalLLMModelConfig | null> {
  return (await listModels()).find((m) => m.id === id) ?? null;
}

/** The selected model, falling back to the default if the stored selection
 * no longer exists (e.g. a custom model that was removed). */
export async function getSelectedModel(): Promise<LocalLLMModelConfig> {
  const { selectedModelId } = await readRegistry();
  return (
    (await getModel(selectedModelId)) ??
    BUILTIN_LOCAL_LLM_MODELS.find((m) => m.id === LOCAL_LLM_DEFAULT_MODEL)!
  );
}

export async function setSelectedModel(id: ModelId): Promise<void> {
  if (!(await getModel(id))) throw new Error(`Unknown local LLM model "${id}"`);
  await writeRegistry((r) => ({ ...r, selectedModelId: id }));
}

/** Derives a filesystem- and id-safe slug from a display name. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
}

export interface NewCustomModel {
  displayName: string;
  url: string;
  contextSize: number;
  chatTemplate: LocalLLMModelConfig['chatTemplate'];
}

/** Adds a user-defined model and returns its config. The id and file name
 * are derived from the name and made unique, so two models never share a
 * downloaded file. */
export async function addCustomModel(input: NewCustomModel): Promise<LocalLLMModelConfig> {
  const displayName = input.displayName.trim();
  const url = input.url.trim();
  if (!displayName) throw new Error('Model name is required');
  if (!/^https:\/\//i.test(url)) throw new Error('Model URL must start with https://');
  if (!/\.gguf(\?|$)/i.test(url)) throw new Error('Model URL must point to a .gguf file');
  if (!Number.isFinite(input.contextSize) || input.contextSize < 512) {
    throw new Error('Context size must be at least 512');
  }

  const existingIds = new Set((await listModels()).map((m) => m.id));
  const base = `custom-${slugify(displayName)}`;
  let id = base;
  for (let n = 2; existingIds.has(id); n++) id = `${base}-${n}`;

  const model: LocalLLMModelConfig = {
    id,
    displayName,
    filename: `${id}.gguf`,
    url,
    contextSize: Math.floor(input.contextSize),
    chatTemplate: input.chatTemplate,
    isCustom: true,
  };
  await writeRegistry((r) => ({ ...r, customModels: [...r.customModels, model] }));
  return model;
}

/** Removes a user-added model from the list. Does not delete its downloaded
 * file — call ModelManager.deleteModel first if that's wanted. */
export async function removeCustomModel(id: ModelId): Promise<void> {
  await writeRegistry((r) => ({
    selectedModelId: r.selectedModelId === id ? LOCAL_LLM_DEFAULT_MODEL : r.selectedModelId,
    customModels: r.customModels.filter((m) => m.id !== id),
  }));
}
