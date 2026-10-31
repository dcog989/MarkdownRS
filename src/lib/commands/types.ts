import type { MessageKey } from "$lib/i18n";

export interface Command {
  id: string;
  labelKey: MessageKey | (() => MessageKey);
  labelValues?: Record<string, string | number>;
  category: MessageKey;
  defaultKey?: string;
  global?: boolean;
  // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic handler return type
  handler?: (e?: KeyboardEvent) => void | boolean | Promise<void | boolean>;
  showInPalette?: boolean;
}
