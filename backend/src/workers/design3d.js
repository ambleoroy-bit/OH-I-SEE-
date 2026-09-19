'use strict';
// Private worker only: no HTTP listener and no public Python execution endpoint.
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto'),os=require('node:os');
require('dotenv').config({path:path.resolve(__dirname,'../../.env')});
const {spawn}=require('node:child_process');
const db=require('../config/supabase'),storage=require('../services/design3d/storage');
const {extract}=require('../services/design3d/orchestrator');
const {validateSpecification,renderOptions}=require('../services/design3d/specification');
const workerId=`${os.hostname()}-${process.pid}-${crypto.randomUUID()}`;
const mode=process.env.DESIGN3D_WORKER_MODE||'bridge';
const bridge=new URL(process.env.BLENDER_BRIDGE_URL||'http://127.0.0.1:8766');
if(mode==='bridge'&&(!['127.0.0.1','localhost','[::1]'].includes(bridge.hostname)||bridge.protocol!=='http:'||bridge.username||bridge.password))throw Error('Development bridge must be loopback HTTP');
if(process.env.NODE_ENV==='production'&&mode!=='headless')throw Error('Production requires a private headless Blender worker');
if(!['bridge','headless'].includes(mode))throw Error('Invalid worker mode');
if(process.env.NODE_ENV==='production'&&!storage.remote())throw Error('Production requires private object storage');
const resource=process.env.DESIGN3D_WORKER_RESOURCE||(mode==='bridge'?`blender-${os.hostname()}-${bridge.port}`:workerId);
const engine=path.resolve(__dirname,'../../blender/construction_engine.py');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function q(p){const r=await p;if(r.error)throw Error(r.error.message);return r.data;}
async function json(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}}
async function available(){if(mode==='headless')return !!process.env.BLENDER_EXECUTABLE;try{const r=await fetch(new URL('/status',bridge),{signal:AbortSignal.timeout(4000)});const d=await r.json();return r.ok&&d.ok;}catch{return false;}}
async function dispatch(manifest){
 if(mode==='headless'){
  const log=await fs.open(path.join(path.dirname(manifest),'blender.log'),'a');
  const child=spawn(process.env.BLENDER_EXECUTABLE,['--background','--python',engine,'--','--manifest',manifest],{stdio:['ignore',log.fd,log.fd],windowsHide:true,shell:false});
  let failure=null;child.on('error',e=>{failure=e;});child.on('exit',()=>log.close());
  return {child,error:()=>failure};
 }
 const code=`import bpy, importlib.util\nif getattr(bpy, '_oh3d_active', None):\n    raise RuntimeError('Blender is already working on a 3D job')\nmodule_spec=importlib.util.spec_from_file_location('ohisee_construction_engine', ${JSON.stringify(engine)})\nmodule=importlib.util.module_from_spec(module_spec)\nmodule_spec.loader.exec_module(module)\nbpy._oh3d_active=${JSON.stringify(manifest)}\ndef scheduled(m=module,p=${JSON.stringify(manifest)}):\n    try:\n        m.run_job(p)\n    finally:\n        bpy._oh3d_active=None\n    return None\nbpy.app.timers.register(scheduled,first_interval=0.2)\nresult={'scheduled':True}`;
 const r=await fetch(bridge,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'python',code,timeout:15}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Object.assign(Error('Blender did not accept the job.'),{code:'BLENDER_UNAVAILABLE'});
 const d=await r.json();if(!d.ok||!d.result?.scheduled)throw Object.assign(Error('Blender did not accept the job.'),{code:'BLENDER_UNAVAILABLE'});
 return {};
}
async function run(job){
 let stage={status:'processing',progress:5,message:'Understanding your requirements'},leaseLost=false,heartbeatBusy=false,spec=null,artifacts={},processHandle=null;
 const beat=async()=>{if(heartbeatBusy)return;heartbeatBusy=true;try{const ok=await q(db.rpc('oh3d_heartbeat',{p_job:job.id,p_worker:workerId,p_resource:resource,p_status:stage.status,p_progress:stage.progress,p_message:stage.message}));if(!ok)leaseLost=true;}catch{leaseLost=true;}finally{heartbeatBusy=false;}};
 const timer=setInterval(beat,15000);
 const directory=storage.safePath(`work/${job.id}`);await fs.mkdir(directory,{recursive:true});
 const manifestPath=path.join(directory,'manifest.json'),progressFile=path.join(directory,'progress.json');
 try{
  const project=await q(db.from('oh3d_projects').select('*').eq('id',job.project_id).single());
  const base=job.base_version_id?await q(db.from('oh3d_versions').select('*').eq('id',job.base_version_id).single()):null;
  let upload=null;if(project.inputs.upload){upload={bytes:await fs.readFile(await storage.local(project.inputs.upload.key)),type:project.inputs.upload.type};}
  spec=job.operation==='retry_render'?validateSpecification(base.specification):await extract({prompt:job.prompt,inputs:project.inputs,previous:base?.specification||null,upload:job.operation==='generate'?upload:null});
  spec=validateSpecification(spec);
  await q(db.from('oh3d_versions').update({specification:spec}).eq('id',job.version_id));
  const baseFile=base?.artifacts?.project?await storage.local(base.artifacts.project):null;
  const manifest={jobId:job.id,projectId:job.project_id,versionId:job.version_id,specification:spec,previousSpecification:base?.specification||null,baseFile,outputDirectory:directory,progressFile,render:renderOptions(job.options),renderOnly:job.operation==='retry_render'};
  await fs.writeFile(manifestPath,JSON.stringify(manifest));
  stage={status:'building',progress:20,message:'Preparing the construction model'};await beat();if(leaseLost)throw Error('Worker lease lost before dispatch');
  processHandle=await dispatch(manifestPath);
  const started=Date.now(),timeout=Number(process.env.DESIGN3D_JOB_TIMEOUT_MS||3600000);
  let result;
  while(Date.now()-started<timeout){
   if(leaseLost)throw Object.assign(Error('Worker lease lost. The model is retained for recovery.'),{code:'WORKER_INTERRUPTED'});
   const progress=await json(progressFile);
   if(progress){if(progress.status==='completed'||progress.status==='failed'){result=progress;break;}if(['building','materials','lighting','rendering'].includes(progress.status))stage={status:progress.status,progress:Math.max(stage.progress,Math.min(98,progress.progress)),message:String(progress.message||'Creating design').slice(0,300)};}
   if(processHandle.error?.())throw processHandle.error();
   if(processHandle.child&&processHandle.child.exitCode!==null)throw Object.assign(Error('Blender exited before completing the model.'),{code:'BLENDER_EXITED'});
   await sleep(1500);
  }
  if(!result)throw Object.assign(Error('Generation exceeded its time limit. Saved files are retained.'),{code:'RENDER_TIMEOUT'});
  const mime={project:'application/octet-stream',model:'model/gltf-binary',exterior:'image/png',livingRoom:'image/png',kitchen:'image/png',masterBedroom:'image/png'};
  for(const [kind,file] of Object.entries(result.files||{})){
   if(!mime[kind])continue;const absolute=path.resolve(file);if(!absolute.startsWith(directory+path.sep))throw Error('Invalid Blender output path');
   const key=`${job.user_id}/${job.project_id}/${job.version_id}/${path.basename(file)}`;artifacts[kind]=await storage.publish(key,file,mime[kind]);
  }
  if(result.status==='failed')throw Object.assign(Error(result.message||'The model was saved, but rendering failed. Retry Render.'),{code:result.code||'RENDER_FAILED'});
  if(!artifacts.exterior||!artifacts.project)throw Error('Blender did not produce the required render and project');
  await beat();if(leaseLost)throw Error('Worker lease lost before completion');
  const saved=await q(db.rpc('oh3d_finish',{p_job:job.id,p_worker:workerId,p_spec:spec,p_artifacts:artifacts,p_error:null,p_message:'Your 3D design is ready'}));if(!saved)throw Error('Completion lease expired');
  console.log(JSON.stringify({job:job.id,status:'completed'}));
 }catch(e){
  if(processHandle?.child&&processHandle.child.exitCode===null)processHandle.child.kill();
  console.error(JSON.stringify({job:job.id,code:e.code||'GENERATION_FAILED',error:e.message}));
  // Preserve a saved .blend even when the render or upload fails.
  if(!artifacts.project){const file=path.join(directory,'project.blend');try{await fs.access(file);artifacts.project=await storage.publish(`${job.user_id}/${job.project_id}/${job.version_id}/project.blend`,file,'application/octet-stream');}catch{}}
  if(!leaseLost)await q(db.rpc('oh3d_finish',{p_job:job.id,p_worker:workerId,p_spec:spec,p_artifacts:artifacts,p_error:e.code||'GENERATION_FAILED',p_message:e.code==='CLARIFICATION_REQUIRED'?e.message:artifacts.project&&e.code==='RENDER_FAILED'?'3D model created, but rendering failed. Retry Render.':e.message})).catch(err=>console.error('Could not persist failure:',err.message));
 }finally{clearInterval(timer);}
}
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function main(){console.log(`OH I SEE private 3D worker: ${mode}`);while(!stopping){try{
 if(!process.env.OPENAI_API_KEY)require('dotenv').config({path:path.resolve(__dirname,'../../.env')});
 if(!process.env.OPENAI_API_KEY||!await available()){await sleep(5000);continue;}
 const jobs=await q(db.rpc('oh3d_claim',{p_worker:workerId,p_resource:resource}));if(jobs?.[0])await run(jobs[0]);else await sleep(3000);
 }catch(e){console.error('3D worker unavailable:',e.message);await sleep(5000);}}}
if(require.main===module)main();
module.exports={run,available,dispatch};
