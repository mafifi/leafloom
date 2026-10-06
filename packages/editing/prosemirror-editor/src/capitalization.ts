/** Pinned NEO 1.3.5 sentence rules, shared by native input and spell corrections. */
export const abbreviations = new Set(['mr','mrs','ms','dr','st','jr','sr','vs','etc','e.g','i.e','cf','approx','no','vol','pp','p','fig','ca','mt','ft','lt','sgt','capt','col','gen','prof','rev','hon','inc','ltd','co','ave','a.m','p.m','sra','sr','srta','dra','av','ex','z.b','bzw','ggf','usw','m','mme','mlle']);
export function capitalCorrection(before: string, character: string, language: string) {
 const uppercase=character.toLocaleUpperCase(language);
 if(character!==uppercase && /\p{L}/u.test(character)) {
  let starts=/^[\s"'“‘„«»(\[¿¡—–-]*$/.test(before);
  if(!starts && /(?<!\.)\.\s+["'“‘„«(\[]?$/.test(before)) {
   const word=(before.replace(/\.\s+["'“‘„«(\[]?$/, '.').match(/([\p{L}.]+)\.$/u)||[])[1]||'';
   starts=!abbreviations.has(word.toLowerCase())&&!/^\p{L}$/u.test(word);
  }
  if(starts)return {replaceBefore:0,text:uppercase};
 }
 if(/^en\b/.test(language) && /^[\s,;:!?'’")”\]—–-]$/.test(character) && /(?:^|[^\p{L}\p{M}\d'’.(-])i$/u.test(before)) return {replaceBefore:1,text:'I'+character};
 return null;
}

/** Character offsets in authored prose; planned text and placeholders are excluded by the caller. */
export function capitalSlips(text: string, language: string): number[] {
 const seen = new Set<number>();
 const lead = text.match(/^[\s"'“‘„«»(\[¿¡—–-]*/)?.[0].length ?? 0;
 if (/\p{Ll}/u.test(text[lead] ?? '') && !/^\p{Ll}\./u.test(text.slice(lead, lead + 2))) seen.add(lead);
 const stop = /(?<!\.)\.\s+["'“‘„«(\[]?(\p{Ll})/gu;
 for (const match of text.matchAll(stop)) {
  const word = text.slice(0, match.index).match(/([\p{L}.]+)$/u)?.[1].toLowerCase() ?? '';
  if (!abbreviations.has(word) && !/^\p{L}$/u.test(word)) seen.add(match.index + match[0].length - 1);
 }
 if (/^en\b/.test(language)) {
  const eye = /(?<![\p{L}\p{M}\d'’.(-])i(?![\p{L}\p{M}\d.)-])(?!['’](?![mdv]|ll|re))/gu;
  for (const match of text.matchAll(eye)) seen.add(match.index);
 }
 return [...seen];
}
