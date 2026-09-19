'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const db=require('../../config/supabase');
const root=path.resolve(process.env.DESIGN3D_STORAGE_ROOT||path.join(__dirname,'../../../.data/design3d'));
const remote=()=>process.env.DESIGN3D_STORAGE==='supabase';
const bucket=()=>process.env.DESIGN3D_BUCKET||'design3d-private';
function safePath(key){if(typeof key!=='string'||!key||key.includes('..')||! /^[a-zA-Z0-9_./-]+$/.test(key)||path.isAbsolute(key))throw Error('Invalid artifact key');const p=path.resolve(root,key);if(!p.startsWith(root+path.sep))throw Error('Artifact outside storage root');return p;}
async function put(key,bytes,type){const p=safePath(key);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,bytes);if(remote()){const {error}=await db.storage.from(bucket()).upload(key,bytes,{contentType:type,upsert:false});if(error&&error.statusCode!=='409')throw Error('Artifact storage upload failed');}return key;}
async function publish(key,file,type){const bytes=await fs.readFile(file);return put(key,bytes,type);}
async function local(key){const p=safePath(key);try{await fs.access(p);return p;}catch{}if(!remote())throw Error('Saved artifact is unavailable');const {data,error}=await db.storage.from(bucket()).download(key);if(error||!data)throw Error('Saved artifact is unavailable');await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,Buffer.from(await data.arrayBuffer()));return p;}
async function urls(project,version){const result={};for(const [kind,key] of Object.entries(version.artifacts||{})){if(!['exterior','livingRoom','kitchen','masterBedroom','model','project'].includes(kind))continue;if(remote()){const {data,error}=await db.storage.from(bucket()).createSignedUrl(key,600);if(error)throw Error('Unable to create private artifact link');result[kind]=data.signedUrl;}else result[kind]=`/api/3d/artifacts/${project.id}/${version.id}/${kind}`;}return result;}
module.exports={root,safePath,put,publish,local,urls,remote};
