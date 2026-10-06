/** Flat NEO title fields retain the original book/global-library ownership. */
export function screenplayTitlePresentation(book:Record<string,unknown>|null,library:Record<string,unknown>,t:(key:string)=>string) {
 const nested=book?.screenplayTitle && typeof book.screenplayTitle==='object' ? book.screenplayTitle as Record<string,unknown> : {};
 const text=(value:unknown)=>typeof value==='string'?value:'';
 return {
  credit:book?.credit!==undefined?text(book.credit):nested.credit!==undefined?text(nested.credit):t('Written by'),
  draft:book?.draft!==undefined?text(book.draft):text(nested.draft),
  contact:library.scriptContact!==undefined?text(library.scriptContact):text(nested.contact),
 };
}
