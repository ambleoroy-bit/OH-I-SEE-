// Loaded only when the user opens the optional GLB viewer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export async function openViewer(host,bytes){
 host.replaceChildren();const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#151515');scene.add(new THREE.HemisphereLight(0xffffff,0x6b6956,2));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(15,25,12);scene.add(sun);
 const gltf=await new GLTFLoader().parseAsync(bytes,'');scene.add(gltf.scene);const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const camera=new THREE.PerspectiveCamera(45,1,.1,2000);camera.position.copy(center).add(new THREE.Vector3(size.x*.9,Math.max(size.y,12)*1.1,size.z*.9));const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.enableDamping=true;
 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(host);resize();let frame;
 const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
 return ()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();gltf.scene.traverse(o=>{o.geometry?.dispose();const mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];mats.forEach(m=>m.dispose());});renderer.dispose();host.replaceChildren();};
}
