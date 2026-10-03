import {z} from 'zod';
export const Dictionary=z.record(z.string(),z.union([z.string(),z.record(z.string(),z.string())]));
export const LanguageCatalog=z.strictObject({locale:z.string(),dict:Dictionary,base:Dictionary});
export type LanguageCatalogValue=z.infer<typeof LanguageCatalog>;
export const english:LanguageCatalogValue={locale:'en',dict:{},base:{}};
export function translate(catalog:LanguageCatalogValue,key:string,args:Record<string,string|number>={}) {
 const upstream=key.replaceAll('Leafloom','NEO');
 let value=catalog.dict[upstream]??catalog.base[upstream]??upstream;
 if(typeof value!=='string') {
  const n=typeof args.n==='number'?args.n:0;let form='other';
  try{form=new Intl.PluralRules(catalog.locale).select(n);}catch{}
  value=value[form]??value.other??Object.values(value)[0]??upstream;
 }
 let numbers:Intl.NumberFormat|undefined;
 try{numbers=new Intl.NumberFormat(catalog.locale);}catch{}
 const template=value.replaceAll('NEO','Leafloom');
 return template.replace(/\{([\w]+)\}/g,(match,name)=>{const argument=args[name];return argument===undefined?match:typeof argument==='number'&&numbers?numbers.format(argument):String(argument);});
}
