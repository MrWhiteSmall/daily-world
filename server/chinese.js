import { Converter } from 'opencc-js/t2cn';

const convert = Converter({ from: 'tw', to: 'cn' });
export function simplified(text) {
  return typeof text === 'string' ? convert(text) : text;
}

// Convert reading text only; keep repository/Skill identifiers and links intact.
export function simplifyItem(item) {
  return { ...item, title: item.kind === 'news' ? simplified(item.title) : item.title, description: simplified(item.description) };
}

export function simplifyTranslation(result) {
  return { ...result, title: simplified(result.title), description: simplified(result.description) };
}
