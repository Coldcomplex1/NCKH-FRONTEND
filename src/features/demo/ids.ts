/** DOM ids shared across the demo (and the SkipLink, which targets the command input). */
export const ROBOT_PANEL_ID = 'robot-panel'
export const COMMAND_INPUT_ID = 'command-input'

export type InputTab = 'text' | 'voice'
export const tabId = (tab: InputTab): string => `input-tab-${tab}`
export const panelId = (tab: InputTab): string => `input-panel-${tab}`
