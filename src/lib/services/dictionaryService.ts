import { callBackendSafe } from "$lib/utils/backend";

/** Writes the words to the user dictionary. False when the write failed (an error was reported). */
export async function addWordsToDictionary(words: string[]): Promise<boolean> {
  const written = await callBackendSafe("add_words_to_dictionary", { words }, "Dictionary:Add");
  return written === true;
}
