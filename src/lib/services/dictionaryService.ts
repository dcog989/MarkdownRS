import { callBackend } from '$lib/utils/backend';
import { AppError } from '$lib/utils/errorHandling';

export async function addToDictionary(word: string): Promise<boolean> {
    try {
        await callBackend('add_to_dictionary', { word }, 'Dictionary:Add');
        return true;
    } catch (err) {
        AppError.handle('Dictionary:Add', err, { showToast: true, severity: 'warning' });
        return false;
    }
}
