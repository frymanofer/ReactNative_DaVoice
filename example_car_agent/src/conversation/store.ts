import RNFS from 'react-native-fs';
import { DEFAULT_CONVERSATION_SETTINGS, normalizeConversationSettings, type ConversationSettings } from './settings';

// The conversation settings survive a restart: one small JSON file in the app's documents folder.
const path = () => `${RNFS.DocumentDirectoryPath}/conversation_settings.json`;

export async function loadConversationSettings(): Promise<ConversationSettings> {
  try {
    if (!(await RNFS.exists(path()))) return DEFAULT_CONVERSATION_SETTINGS;
    return normalizeConversationSettings(JSON.parse(await RNFS.readFile(path(), 'utf8')));
  } catch (error) {
    console.log('[Conversation] settings could not be read, using the defaults:', String(error));
    return DEFAULT_CONVERSATION_SETTINGS;
  }
}

export async function saveConversationSettings(settings: ConversationSettings): Promise<void> {
  try {
    await RNFS.writeFile(path(), JSON.stringify(settings), 'utf8');
  } catch (error) {
    console.log('[Conversation] settings could not be saved:', String(error));
  }
}
