import * as THREE from 'three';
import { BimViewer } from './bim-viewer.js';
export const SURFACES = {exterior:'Primary exterior',secondary:'Secondary facade',accent:'Accent elements',interior:'Interior walls',roof:'Roof',doors:'Doors',windows:'Window frames',railing:'Railing',boundary:'Boundary wall',landscape:'Landscape',flooring:'Flooring'};
export const MATERIALS = {plaster:'White plaster',concrete:'Concrete',stone:'Natural stone',brick:'Brick',wood:'Wood',granite:'Granite',marble:'Marble',paint:'Textured paint',tile:'Facade tile',glass:'Glass'};
export function defaults() {return {style:'Modern',referenceId:null,referenceFeatures:['Exterior Style'],instructions:'',surfaces:Object.fromEntries(Object.keys(SURFACES).map(k=>[k,{material:k==='doors'?'wood':k==='landscape'?'paint':'plaster',color:({exterior:'#F4F1E8',secondary:'#C6C3BA',accent:'#53463B',roof:'#626B70',doors:'#82532E',windows:'#29363B',railing:'#3A4448',boundary:'#E4E1DA',landscape:'#54733C',flooring:'#DBD5C7',interior:'#F4F1E8'})[k]}]))};}
export function surfaceOf(el) {
  if(el.type==='Wall') {if(el.properties?.boundary)return 'boundary';if(el.properties?.interior)return 'interior';const key=el.properties?.wallKey||el.id;return key.includes('ext-e')?'secondary':'exterior';}
  return ({Roof:'roof',Door:'doors',Window:'windows',Railing:'railing',Column:'accent',Beam:'accent',Slab:'accent',Site:'landscape'})[el.type] || (el.type==='Room'?(el.geometry?.kind==='landscape'?'landscape':'flooring'):null);
}
export function textureCanvas(kind,color='#d5d0c5') {
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,128,128);
  let seed=19;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  if(kind==='brick'||kind==='tile'||kind==='stone') {const h=kind==='tile'?32:16,w=kind==='stone'?42:32; x.strokeStyle='rgba(0,0,0,.25)';for(let row=0;row<128/h;row++)for(let col=-1;col<128/w;col++){x.fillStyle=`rgba(255,255,255,${rand()*.15})`;x.fillRect(col*w+(row%2)*w/2,row*h,w-2,h-2);x.strokeRect(col*w+(row%2)*w/2,row*h,w-2,h-2);}}
  else if(kind==='wood'){for(let y=0;y<128;y+=3){x.strokeStyle=`rgba(35,12,0,${rand()*.3})`;x.beginPath();x.moveTo(0,y);x.bezierCurveTo(40,y+rand()*8,80,y-6,128,y);x.stroke();}}
  else if(kind==='marble'){x.strokeStyle='#9b999580';for(let n=0;n<8;n++){x.beginPath();x.moveTo(rand()*128,0);x.bezierCurveTo(rand()*128,40,rand()*128,80,rand()*128,128);x.stroke();}}
  else for(let i=0;i<1300;i++){x.fillStyle=`rgba(${rand()>.5?'255,255,255':'0,0,0'},${rand()*(kind==='granite'?.32:.06)})`;x.fillRect(rand()*128,rand()*128,1+rand()*2,1+rand()*2);}
  return c;
}
export class HomeViewer extends BimViewer {
  constructor(container,options={}) {super(container,{...options,mode:'home'});this.surfaceTextures=[];this.observer=new ResizeObserver(()=>this.onResize());this.observer.observe(container);}
  applyConfiguration(config) {
    this.surfaceTextures.forEach(t=>t.dispose());this.surfaceTextures=[];
    const textures={};let counts={};
    for(const mesh of this.meshes.values()) {
      const surface=surfaceOf(mesh.userData.element),s=config.surfaces?.[surface];if(!s)continue;counts[surface]=(counts[surface]||0)+1;
      if(!textures[surface]) {const t=new THREE.CanvasTexture(textureCanvas(s.material,'#ffffff'));t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);textures[surface]=t;this.surfaceTextures.push(t);}
      mesh.traverse(child=>{if(!child.isMesh)return;const mats=Array.isArray(child.material)?child.material:[child.material];for(const m of mats){if(!m.color)continue;m.color.set(s.color);m.map=textures[surface];m.roughness=s.material==='glass'?.15:s.material==='marble'?.3:.8;m.needsUpdate=true;}});
    }
    return counts;
  }
  view(name) {if(name==='rotate'){this.controls.autoRotate=!this.controls.autoRotate;return;}this.controls.autoRotate=false;if(['rear','left','right'].includes(name)){const box=new THREE.Box3().setFromObject(this.modelGroup),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),dist=Math.max(size.x,size.y,size.z,4)*1.7;this.camera.position.set(center.x+(name==='left'?-dist:name==='right'?dist:0),center.y+size.y*.3,center.z+(name==='rear'?-dist:0));this.controls.target.copy(center);this.controls.update();}else this.setCameraView(name);}
  snapshot(){this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png');}
  dispose(){this.observer?.disconnect();this.surfaceTextures?.forEach(t=>t.dispose());super.dispose();}
}