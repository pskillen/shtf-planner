export const app = () => document.getElementById('app')!;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const k of kids) e.append(k);
  return e;
}

export function logBox() {
  const pre = el('pre');
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    pre.textContent = lines.join('\n');
    pre.scrollTop = pre.scrollHeight;
    console.log(s);
    (window as any).__log = lines;
  };
  return { pre, log, lines };
}

export function button(label: string, fn: () => void | Promise<void>) {
  return el('button', {
    textContent: label,
    onclick: () => {
      Promise.resolve(fn()).catch((e) => alert(String(e)));
    },
  });
}

export const gz = async (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
};
