'use strict';
const Ajv = require('ajv');
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const number = (min,max,integer=false) => ({type:integer?'integer':'number',minimum:min,maximum:max});
const nullable = (min,max) => ({anyOf:[number(min,max),{type:'null'}]});
const choice = values => ({type:'string',enum:values});
const roomTypes=['bedroom','living','dining','kitchen','bathroom','lounge','corridor'];
const schema=object({
 schemaVersion:{type:'integer',const:1},projectType:choice(['new_home','floor_plan']),location:{type:'string',maxLength:160},
 plot:object({width:nullable(15,300),depth:nullable(15,300),area:nullable(300,90000),units:{type:'string',const:'ft'}}),
 building:object({floors:number(1,3,true),builtUpArea:number(300,12000),style:choice(['modern','contemporary','traditional','luxury']),floorHeight:number(2.7,4.2)}),
 rooms:object({bedrooms:number(1,8,true),livingRooms:number(1,2,true),diningRooms:number(1,2,true),kitchens:number(1,2,true),bathrooms:number(1,8,true)}),
 features:object({balcony:{type:'boolean'},balconyCount:number(0,6,true),garden:{type:'boolean'},parking:{type:'boolean'},swimmingPool:{type:'boolean'}}),
 materials:object({exterior:choice(['white_marble','cream_stone','white_plaster','brick']),flooring:choice(['marble','wood','ceramic']),interior:choice(['light_wood','dark_wood']),windows:{type:'string',const:'glass'}}),
 lighting:object({style:choice(['warm_luxury','neutral']),timeOfDay:choice(['day','evening'])}),
 layoutPreferences:object({livingRoomScale:number(.7,1.6),balconyDepth:number(.9,2.4)}),
 layout:{type:'array',maxItems:40,items:object({id:{type:'string',pattern:'^[a-z][a-z0-9_]{0,39}$'},type:choice(roomTypes),floor:number(0,2,true),x:number(0,100),y:number(0,100),width:number(1.2,30),depth:number(1.2,30)})},
 assumptions:{type:'array',maxItems:10,items:{type:'string',maxLength:300}},clarification:{anyOf:[{type:'string',maxLength:300},{type:'null'}]}
});
const validate=new Ajv({allErrors:true,strict:false}).compile(schema);
function fail(message,status=400,code='INVALID_SPECIFICATION'){const e=new Error(message);Object.assign(e,{status,code});throw e;}
function validateSpecification(value){
 if(!validate(value))fail('Invalid construction specification: '+validate.errors.map(e=>`${e.instancePath} ${e.message}`).slice(0,5).join('; '));
 const s=structuredClone(value);
 if(s.clarification)fail(s.clarification,422,'CLARIFICATION_REQUIRED');
 if(s.building.floors===1 && s.features.balconyCount)fail('A first-floor balcony needs at least two floors.',422,'CLARIFICATION_REQUIRED');
 if(s.features.balcony !== (s.features.balconyCount>0))fail('Balcony count must match the requested balcony feature.');
 if(s.features.balconyCount>2*(s.building.floors-1))fail('This design supports up to two balconies per upper floor. Can you reduce the balcony count?',422,'CLARIFICATION_REQUIRED');
 const area=s.plot.width&&s.plot.depth?s.plot.width*s.plot.depth:s.plot.area;
 if(area && s.building.builtUpArea/s.building.floors>area*.8)fail('The requested home leaves too little outdoor space. Can you confirm the plot size or reduce the built-up area?',422,'CLARIFICATION_REQUIRED');
 const ids=new Set();
 for(const r of s.layout){
  if(ids.has(r.id))fail('Room IDs must be unique.');ids.add(r.id);
  if(r.floor>=s.building.floors)fail('A room is assigned to a floor that does not exist.');
  for(const q of s.layout){if(q===r||q.floor!==r.floor)continue;if(Math.min(r.x+r.width,q.x+q.width)-Math.max(r.x,q.x)>.02 && Math.min(r.y+r.depth,q.y+q.depth)-Math.max(r.y,q.y)>.02)fail('The extracted floor plan has overlapping rooms. Please upload a clearer plan.',422,'CLARIFICATION_REQUIRED');}
 }
 if(s.layout.length){
  const count=type=>s.layout.filter(r=>r.type===type).length;
  for(const [key,type] of [['bedrooms','bedroom'],['livingRooms','living'],['diningRooms','dining'],['kitchens','kitchen'],['bathrooms','bathroom']])if(count(type)!==s.rooms[key])fail('Room counts do not match the extracted floor plan.',422,'CLARIFICATION_REQUIRED');
 }
 return s;
}
function validateInput(body){
 if(!body||typeof body!=='object'||Array.isArray(body))fail('Enter your home requirements.');
 const prompt=typeof body.prompt==='string'?body.prompt.trim():'';
 if(!prompt||prompt.length>8000)fail('Describe your home in 1–8,000 characters.');
 const inputs={};
 for(const k of ['location','style'])if(body[k]!=null){if(typeof body[k]!=='string'||body[k].length>160)fail(`Invalid ${k}.`);inputs[k]=body[k];}
 for(const k of ['plotWidth','plotDepth','budget'])if(body[k]!=null&&body[k]!==''){const n=Number(body[k]);if(!Number.isFinite(n)||n<=0||n>(k==='budget'?1e10:300))fail(`Invalid ${k}.`);inputs[k]=n;}
 return {prompt,inputs};
}
function validateUpload(upload){
 if(!upload)return null;
 if(!upload||typeof upload.data!=='string'||typeof upload.name!=='string')fail('Invalid floor-plan file.');
 if(upload.data.length>8*1024*1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data))fail('Upload a PNG, JPEG or PDF under 6 MB.');
 const bytes=Buffer.from(upload.data,'base64');if(bytes.length<8||bytes.length>6*1024*1024)fail('Upload a PNG, JPEG or PDF under 6 MB.');
 const type=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':null;
 if(!type)fail('File contents must be PNG, JPEG or PDF.');
 return {bytes,type,name:type==='application/pdf'?'floor-plan.pdf':type==='image/png'?'floor-plan.png':'floor-plan.jpg'};
}
function renderOptions(raw={}){
 const width=Number(raw.width??process.env.DESIGN3D_WIDTH??1600),height=Number(raw.height??process.env.DESIGN3D_HEIGHT??1100),samples=Number(raw.samples??process.env.DESIGN3D_SAMPLES??64);
 if(![width,height,samples].every(Number.isInteger)||width<640||width>2048||height<480||height>1600||samples<16||samples>256)fail('Unsupported render settings.');
 return {width,height,samples,interiors:raw.interiors===true,exportGlb:raw.exportGlb!==false};
}
module.exports={schema,validateSpecification,validateInput,validateUpload,renderOptions,fail};

