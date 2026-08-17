import { editCommands } from './editCommands';
import { editorCommands } from './editorCommands';
import { emojiCommands } from './emojiCommands';
import { exportCommands } from './exportCommands';
import { fileCommands } from './fileCommands';
import { markdownCommands } from './markdownCommands';
import { navigationCommands } from './navigationCommands';
import { textOpCommands } from './textOpCommands';
import type { Command } from './types';
import { viewCommands } from './viewCommands';
import { windowCommands } from './windowCommands';

export const commands: Command[] = [
  ...fileCommands,
  ...editCommands,
  ...emojiCommands,
  ...exportCommands,
  ...viewCommands,
  ...navigationCommands,
  ...windowCommands,
  ...editorCommands,
  ...textOpCommands,
  ...markdownCommands,
];
