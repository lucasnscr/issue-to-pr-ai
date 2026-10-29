export async function discardRunner({vm,repo,runId,listVms,deleteVm,listRunners,deleteRunner,cancelRun,record,
  attempts=73,delay=()=>new Promise(resolve=>setTimeout(resolve,5000))}){
  if(!/^sentinela-ai-job-[a-f0-9]{8}$/.test(vm))throw Error('Refusing to discard an unrelated VM.');
  // Local data must be erased even if GitHub is unavailable or still marks
  // a disconnected runner busy. Do not put a remote call before this boundary.
  if(listVms().some(item=>item.name===vm))deleteVm(vm);
  const vmRemoved=!listVms().some(item=>item.name===vm);
  if(!vmRemoved)throw Error('Ephemeral VM cleanup failed; operator attention required.');
  let registrationRemoved=false,cancelled=false;
  for(let n=0;n<attempts;n++){
    try{
      const owned=listRunners(repo).filter(item=>item.name===vm);
      if(!owned.length){registrationRemoved=true;break;}
      if(owned.some(item=>item.busy)&&!cancelled){
        // Only this provider-owned run has lost its executor. Hosted validation
        // is not cancelled after a normally completed ephemeral model job.
        cancelled=true;try{cancelRun(repo,runId);}catch{/* Already cancelled or unavailable; removal still gets attempted. */}
      }
      for(const runner of owned)deleteRunner(repo,runner.id);
      if(!listRunners(repo).some(item=>item.name===vm)){registrationRemoved=true;break;}
    }catch{/* Retry boundedly; the local VM has already been destroyed. */}
    if(n+1<attempts)await delay();
  }
  record({type:registrationRemoved?'destroyed':'cleanup-incomplete',repo,runId,vm,vmRemoved,registrationRemoved,cancelRequested:cancelled});
  if(!registrationRemoved)throw Error('VM removed, but GitHub runner removal is not confirmed; reconcile this registration before resuming.');
}
