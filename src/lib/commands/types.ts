export interface Command {
  id: string;
  label: string;
  category: string;
  defaultKey?: string;
  // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic handler return type
  handler?: (e?: KeyboardEvent) => void | boolean | Promise<void | boolean>;
  showInPalette?: boolean;
}
