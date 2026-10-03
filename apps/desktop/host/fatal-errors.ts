import {reportRuntimeError} from './runtime-errors.ts';

/** Fatal host state is never resumed; diagnostics contain no exception payload. */
export function installHostFatalLogging(root:string):void {
  let terminating=false;
  const fatal=()=>{
    if(terminating)process.exit(1);
    terminating=true;
    process.stderr.write(JSON.stringify({event:'host.fatal',code:'UNEXPECTED_RUNTIME'})+'\n');
    // A blocked filesystem must not keep a corrupted worker alive indefinitely.
    setTimeout(()=>process.exit(1),2000);
    void (async()=>{
      try {
        await reportRuntimeError(root,{source:'host',code:'UNEXPECTED_RUNTIME',at:new Date().toISOString()});
      } finally {
        process.exit(1);
      }
    })();
  };
  process.on('uncaughtException',fatal);
  process.on('unhandledRejection',fatal);
}
