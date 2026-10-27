import catalog from "./en.json" with {type:"json"};
export type CopyKey = keyof typeof catalog;
export function t(
  key: CopyKey,
  values: Record<string, string | number> = {},
): string {
  return catalog[key].replace(/\{([a-zA-Z_]+)\}/g, (_match, name: string) => {
    if (!(name in values)) throw Error("Missing copy value: " + name);
    return String(values[name]);
  });
}
