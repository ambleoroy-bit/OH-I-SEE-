/* CAD data adapter: exports drawing geometry without certifying a building design. */
(function(root){
'use strict';
const round=n=>Math.round(n*10000)/10000;
function create(requirements,drawingRooms){
 const r=requirements;if(!Number.isFinite(r.plotLength)||!Number.isFinite(r.plotWidth)||r.plotLength<=0||r.plotWidth<=0)throw Error('Valid plot dimensions are required');
 const directions={North:{x:0,y:-1},South:{x:0,y:1},East:{x:-1,y:0},West:{x:1,y:0}};
 const rooms=drawingRooms.map((a,i)=>({id:'GF-R'+String(i+1).padStart(2,'0'),floor:0,name:a.type==='bedroom'?({'Bedroom 1':'Master Bedroom','Bedroom 2':"Children’s Bedroom",'Bedroom 3':'Guest Bedroom'}[a.name]||a.name):a.name,type:a.type,x:round(a.x/8),y:round(a.y/8),length:round(a.h/8),width:round(a.w/8),area_sqft:round(a.w*a.h/64),side:a.side||null}));
 const walls=[],doors=[],windows=[],dimensions=[];
 for(const a of rooms){
  if(!a.side)continue;
  for(const [edge,x1,y1,x2,y2] of [['N',a.x,a.y,a.x+a.width,a.y],['E',a.x+a.width,a.y,a.x+a.width,a.y+a.length],['S',a.x,a.y+a.length,a.x+a.width,a.y+a.length],['W',a.x,a.y,a.x,a.y+a.length]])walls.push({id:a.id+'-W'+edge,floor:0,room_id:a.id,start:{x:round(x1),y:round(y1)},end:{x:round(x2),y:round(y2)},thickness:null,height:null,geometry_type:'room_boundary',status:'wall_assembly_requires_design'});
  const doorWidth=Math.min(23/8,a.length*.36),doorY=a.y+a.length-doorWidth-.5;
  doors.push({id:a.id+'-D',floor:0,room_id:a.id,type:'D1',wall_id:a.id+'-W'+(a.side==='left'?'E':'W'),x:round(a.side==='left'?a.x+a.width:a.x),y:round(doorY),width:round(doorWidth),height:null,axis:'y',status:'opening_width_from_drawing_height_unconfirmed'});
  windows.push({id:a.id+'-WIN',floor:0,room_id:a.id,type:'W1',wall_id:a.id+'-W'+(a.side==='left'?'W':'E'),x:round(a.side==='left'?a.x:a.x+a.width),y:round(a.y+a.length*.4),width:round(a.length*.3),height:null,sill_height:null,axis:'y',status:'opening_width_from_drawing_height_unconfirmed'});
  dimensions.push({id:a.id+'-L',floor:0,from:{x:a.x,y:a.y},to:{x:a.x,y:round(a.y+a.length)},value:a.length,units:'ft'},{id:a.id+'-B',floor:0,from:{x:a.x,y:a.y},to:{x:round(a.x+a.width),y:a.y},value:a.width,units:'ft'});
 }
 const schedule=rooms.filter(a=>!['garden','corridor'].includes(a.type)).map(a=>({room_id:a.id,room_name:a.name,floor:0,length:a.length,width:a.width,area_sqft:a.area_sqft}));
 const total=types=>round(rooms.filter(a=>types.includes(a.type)).reduce((n,a)=>n+a.area_sqft,0));
 const missing=['Surveyed site boundary and applicable setbacks','Wall assemblies and thicknesses','Door/window heights and sill levels','Structural system and foundation design'];if(r.floors>1)missing.push('Separate upper-floor layouts and dimensioned stair design');
 return {schema_version:1,project_name:'OH I SEE Residential Concept',design_status:'concept_requires_review',construction_ready:false,source:'deterministic_blueprint_geometry',units:{length:'ft',area:'sq.ft'},coordinate_system:{origin:'front-left plot corner',x_axis:'right',y_axis:'toward rear',svg_units_per_foot:8,cad_y_up_transform:'x_cad=x, y_cad=-y'},plot_size:{width:r.plotLength,length:r.plotWidth,area_sqft:round(r.plotLength*r.plotWidth),boundary:[{x:0,y:0},{x:r.plotLength,y:0},{x:r.plotLength,y:r.plotWidth},{x:0,y:r.plotWidth}],measurement_status:'user_entered_unverified'},road_facing:r.roadFacing,north_direction:directions[r.roadFacing]||null,building_footprint:null,setbacks:{front:null,rear:null,left:null,right:null},built_up_area:null,plinth_area:null,carpet_area:total(['living','dining','kitchen','bedroom','bathroom','pooja','office','utility','corridor']),carpet_area_basis:'Sum of conceptual room rectangles; not certified net measured area',parking_area:total(['parking']),requested_floors:r.floors,plans:[{id:'GF',name:'Ground Floor',floor:0,status:'concept'}],rooms,walls,doors,windows,staircases:rooms.filter(a=>a.type==='staircase').map(a=>({room_id:a.id,floor:0,x:a.x,y:a.y,width:a.width,length:a.length,riser:null,tread:null,flights:null,status:'stair_design_pending'})),annotations:[{type:'design_note',text:'Room rectangles are not a construction-ready wall model. Do not extrude boundary lines as verified walls.'},{type:'ventilation',text:'Exterior opening locations are shown; daylight, ventilation and neighbouring obstructions require review.'}],room_schedule:schedule,door_schedule:doors.map(a=>({door_id:a.id,door_type:a.type,width:a.width,height:a.height})),window_schedule:windows.map(a=>({window_id:a.id,window_type:a.type,width:a.width,height:a.height})),dimension_lines:dimensions,unresolved_requirements:missing};
}
if(typeof module!=='undefined'&&module.exports)module.exports={create};else root.BlueprintCAD={create};
})(typeof window==='undefined'?globalThis:window);
