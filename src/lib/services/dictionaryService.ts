import { callBackend } from '$lib/utils/backend';

export async function addToDictionary(word: string): Promise<boolean> {
    try {
        await callBackend('add_to_dictionary', { word }, 'Dictionary:Add', undefined, {
            report: true,
        });
        return true;
    } catch (err) {
        return false;
    }
}
