import { callBackendSafe } from '$lib/utils/backend';

export async function addToDictionary(word: string): Promise<boolean> {
  const result = await callBackendSafe('add_to_dictionary', { word }, 'Dictionary:Add', {
    showToast: false,
  });
  return result !== null;
}

export async function addWordsToDictionary(words: string[]): Promise<boolean> {
  const result = await callBackendSafe('add_words_to_dictionary', { words }, 'Dictionary:Add', {
    showToast: false,
  });
  return result !== null;
}
