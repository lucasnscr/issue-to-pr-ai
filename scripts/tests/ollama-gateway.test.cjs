const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const path=require('node:path');
test('loopback inference gateway rejects missing keys, unknown paths and another model before forwarding',async()=>{
 const child=spawn(process.execPath,[path.resolve(__dirname,'../ollama-loopback-proxy.mjs')],{env:{...process.env,OLLAMA_PROXY_PORT:'0',OLLAMA_GATEWAY_TOKEN:'synthetic-gateway-key'},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Gateway startup timeout')),5000);child.once('error',reject);child.stdout.once('data',data=>{clearTimeout(timeout);resolve(JSON.parse(String(data)).listening)});});
  const url='http://127.0.0.1:'+port;
  assert.equal((await fetch(url+'/api/version')).status,401);
  assert.equal((await fetch(url+'/api/version',{headers:{authorization:'Bearer wrong'}})).status,401);
  assert.equal((await fetch(url+'/.env',{headers:{authorization:'Bearer synthetic-gateway-key'}})).status,404);
  assert.equal((await fetch(url+'/api/chat',{method:'POST',headers:{authorization:'Bearer synthetic-gateway-key'},body:JSON.stringify({model:'another-model'})})).status,403);
 }finally{child.kill('SIGTERM');}
});
