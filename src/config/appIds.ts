export const appIds = [
  "finder",
  "textedit",
  "ipod",
  "control-panels",
] as const;

export type AppId = typeof appIds[number]; 