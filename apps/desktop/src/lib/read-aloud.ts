export type ReadingSentence={id:string;text:string;from:number;to:number};
export type LocalVoice={id:string;language:string;default:boolean;local:boolean};
export interface LocalSpeechPort {
 ready():Promise<boolean>;
 voices():readonly LocalVoice[];
 speak(text:string,voice:LocalVoice,events:{start():void;end():void;error():void}):void;
 cancel():void;
}
export interface ReadingDocumentPort {
 sentences(language:string):ReadingSentence[];
 connected(sentence:ReadingSentence):boolean;
 highlight(sentence:ReadingSentence):void;
 clearHighlight():void;
 caret(sentence:ReadingSentence):void;
}
export interface ReadAloudContext {
 language():string;
 document:ReadingDocumentPort;
 speech:LocalSpeechPort|null;
 unavailable():void;
}
/** Speech progress is transient; the author document and its history remain untouched. */
export class ReadAloud {
 private generation=0;
 private active=false;
 private reached:ReadingSentence|null=null;
 constructor(private readonly context:ReadAloudContext){}
 get reading(){return this.active;}
 async toggle():Promise<void>{
  if(this.active){this.stop(true);return;}
  const speech=this.context.speech;
  if(!speech){this.context.unavailable();return;}
  const generation=++this.generation;this.active=true;
  if(!await speech.ready().catch(()=>false)){if(this.generation===generation){this.stop(false);this.context.unavailable();}return;}
  if(this.generation!==generation)return;
  const language=this.context.language().toLowerCase().replaceAll('_','-'),base=language.split('-')[0]!;
  const voices=speech.voices().filter(voice=>voice.local);
  const voice=voices.find(v=>v.language.toLowerCase().replaceAll('_','-')===language&&v.default)??voices.find(v=>v.language.toLowerCase().replaceAll('_','-')===language)??voices.find(v=>v.language.toLowerCase().replaceAll('_','-').split('-')[0]===base)??voices.find(v=>v.default)??voices[0];
  if(!voice){this.stop(false);this.context.unavailable();return;}
  const sentences=this.context.document.sentences(language);let index=0;
  const next=()=>{
   if(this.generation!==generation)return;
   const sentence=sentences[index++];
   if(!sentence||!this.context.document.connected(sentence)){this.stop(false);return;}
   try {speech.speak(sentence.text.trim(),voice,{start:()=>{if(this.generation!==generation)return;this.reached=sentence;this.context.document.highlight(sentence);},end:next,error:()=>{if(this.generation===generation)this.stop(false);}});}catch{this.stop(false);this.context.unavailable();}
  };
  speech.cancel();next();
 }
 stop(leaveCaret=true):void{
  const reached=this.reached;this.generation++;this.active=false;this.reached=null;
  this.context.speech?.cancel();this.context.document.clearHighlight();
  if(leaveCaret&&reached&&this.context.document.connected(reached))this.context.document.caret(reached);
 }
}
