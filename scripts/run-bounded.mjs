import {spawn} from 'node:child_process';

const duration=value=>{
  const match=/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value??'');
  if(!match)throw new Error('INVALID_TIMEOUT_DURATION');
  const ms=Number(match[1])*({ms:1,s:1000,m:60000,h:3600000}[match[2]??'s']);
  if(!Number.isFinite(ms)||ms<=0||ms>2147483647)throw new Error('INVALID_TIMEOUT_DURATION');
  return ms;
};
const [timeout,grace,command,...args]=process.argv.slice(2);
const timeoutMs=duration(timeout),graceMs=duration(grace);
if(!command)throw new Error('MISSING_BOUNDED_COMMAND');
const child=spawn(command,args,{stdio:'inherit',detached:true});
let expired=false,killTimer;
const signalGroup=signal=>{
  if(child.pid)try {process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}
};
const terminate=()=>{
  expired=true;signalGroup('SIGTERM');
  killTimer??=setTimeout(()=>signalGroup('SIGKILL'),graceMs);
};
const timer=setTimeout(terminate,timeoutMs);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,terminate);
child.on('error',error=>{
  clearTimeout(timer);clearTimeout(killTimer);console.error(error.message);process.exitCode=127;
});
child.on('exit',code=>{
  clearTimeout(timer);
  // After a timeout, retain the group kill even when its leader exits first:
  // an inherited build child may still be running during the grace period.
  if(!expired)clearTimeout(killTimer);
  process.exitCode=expired?124:(code??1);
});
