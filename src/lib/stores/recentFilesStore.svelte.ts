import { callBackend } from '$lib/utils/backend';
import { getCurrentTimestamp } from '$lib/utils/date';

export const recentFilesStore = $state({
    files: [] as string[],
    isLoaded: false,
});

export async function loadRecentFiles() {
    if (recentFilesStore.isLoaded) return;

    const files = await callBackend('get_recent_files', {}, 'Database:Init', undefined, {
        ignore: true,
    });

    if (files) {
        recentFilesStore.files = files;
    }
    recentFilesStore.isLoaded = true;
}

export async function addToRecentFiles(path: string) {
    const timestamp = getCurrentTimestamp();

    // Optimistic UI update
    recentFilesStore.files = [path, ...recentFilesStore.files.filter((f) => f !== path)].slice(
        0,
        999,
    );

    await callBackend(
        'add_to_recent_files',
        { path, lastOpened: timestamp },
        'Database:Init',
        undefined,
        {
            ignore: true,
        },
    );
}

export async function removeFromRecentFiles(path: string) {
    // Optimistic UI update
    recentFilesStore.files = recentFilesStore.files.filter((f) => f !== path);

    await callBackend('remove_from_recent_files', { path }, 'Database:Init', undefined, {
        ignore: true,
    });
}

export async function clearRecentFiles() {
    recentFilesStore.files = [];
    await callBackend('clear_recent_files', {}, 'Database:Init', undefined, {
        ignore: true,
    });
}
