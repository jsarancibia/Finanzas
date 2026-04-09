const TYPO_REPLACEMENTS: [RegExp, string][] = [
  [/\bahrro\b/gi, 'ahorro'],
  [/\bahoro\b/gi, 'ahorro'],
  [/\bahorrro\b/gi, 'ahorro'],
  [/\baorro\b/gi, 'ahorro'],
  [/\bahorrr\b/gi, 'ahorro'],
  [/\bahoroo\b/gi, 'ahorro'],
  [/\bingerso\b/gi, 'ingreso'],
  [/\bingrseo\b/gi, 'ingreso'],
  [/\bgaste\b/gi, 'gasté'],
  [/\bdispnible\b/gi, 'disponible'],
  [/\bdiponible\b/gi, 'disponible'],
  [/\brepartier\b/gi, 'repartir'],
  [/\bbando\s+estado\b/gi, 'banco estado'],
];

export function corregirTypos(text: string): string {
  let s = text;
  for (const [re, fix] of TYPO_REPLACEMENTS) {
    s = s.replace(re, fix);
  }
  return s;
}
