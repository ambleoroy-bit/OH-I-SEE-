/* Client presentation sheet. Geometry remains available as structured rectangles. */
(function(){
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const names={living:'Living room',dining:'Dining room',bedroom:'Bedroom',kitchen:'Kitchen',bathroom:'Bathroom',pooja:'Pooja room',office:'Home office',utility:'Utility',staircase:'Staircase',parking:'Parking',garden:'Entry garden',corridor:'Gallery'};
const colors={living:'#ece5d9',dining:'#eee8de',bedroom:'#e4ebe5',kitchen:'#e3e9ec',bathroom:'#dce8e9',pooja:'#f0e5d5',office:'#e7e3ee',utility:'#e3e9ec',staircase:'#e7e5df',parking:'#e9e8e2',garden:'#dce5d4',corridor:'#f4f1e9'};
window.planRooms=function(r,pw,ph,wall){
 const rooms=[],gap=wall,cw=Math.min(3.5*8,pw*.13),front=r.parking?Math.min(144,ph*.23):Math.min(40,ph*.08),left=[],right=[];
 function add(type,side,n){side.push({type,name:n?names[type]+' '+n:names[type],weight:{living:15,dining:10,kitchen:12,bathroom:6,pooja:6,utility:6,staircase:12}[type]||12});}
 add('living',left);add('kitchen',right);add('dining',left);
 for(let i=0;i<r.bedrooms;i++)add('bedroom',i%2?left:right,i+1);
 for(let i=0;i<r.bathrooms;i++)add('bathroom',i%2?right:left,i+1);
 if(r.hasPooja)add('pooja',right);if(r.hasOffice)add('office',left);if(r.hasUtility)add('utility',right);if(r.floors>1)add('staircase',right);
 const col=(pw-cw-4*gap)/2,start=front+gap,avail=ph-start-gap;
 for(const [list,side] of [[left,'left'],[right,'right']]){let y=start;const total=list.reduce((a,b)=>a+b.weight,0);for(const room of list){const h=(avail-(list.length-1)*gap)*room.weight/total;rooms.push({...room,side,x:side==='left'?gap:2*gap+col+cw,y,w:col,h});y+=h+gap;}}
 rooms.push({type:'corridor',name:'Entry gallery',x:col+2*gap,y:gap,w:cw,h:ph-2*gap});
 rooms.push({type:r.parking?'parking':'garden',name:r.parking?(r.parking===2?'2-car forecourt':'Car porch'):'Entry court',x:gap,y:gap,w:col,h:front-gap});
 rooms.push({type:'garden',name:r.hasGarden?'Entry garden':'Entrance court',x:2*gap+col+cw,y:gap,w:col,h:front-gap});
 return rooms;
};
function furniture(r){const w=r.w,h=r.h;let s='';if(w<45||h<40)return s;
 const box=(x,y,w,h,rx=2)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#faf9f4" stroke="#a3aaa2" stroke-width=".85"/>`;
 const y=h*.52;
 if(r.type==='bedroom'){let bw=Math.min(w*.48,44),bh=Math.min(h*.4,49),x=(w-bw)/2;s+=box(x,y,bw,bh)+box(x+3,y+3,bw/2-5,8)+box(x+bw/2+1,y+3,bw/2-5,8)+`<path d="M${x},${y+15}h${bw}" stroke="#a3aaa2" fill="none"/>`+box(6,h-14,w*.22,9);}
 if(r.type==='living'){s+=box(9,y,w*.52,17)+box(9,y-3,7,22)+box(w*.52+2,y-3,7,22)+box(w*.34,y+24,w*.32,12,5);}
 if(r.type==='dining'){const x=w*.32,tw=w*.4,th=Math.min(28,h*.3);s+=box(x,y,tw,th,5);for(let i=0;i<2;i++){s+=box(x+5+i*tw*.5,y-7,10,6)+box(x+5+i*tw*.5,y+th+1,10,6);}}
 if(r.type==='kitchen'){s+=box(7,y,w-14,12)+box(w-19,y,12,Math.max(13,h-y-8));for(let i=0;i<2;i++)s+=`<circle cx="${w*.3+i*9}" cy="${y+6}" r="3" fill="none" stroke="#7c8986"/>`;s+=box(w*.65,y+2,14,8);}
 if(r.type==='bathroom'){s+=box(8,y,18,Math.min(20,h-y-5))+`<ellipse cx="${w*.6}" cy="${y+9}" rx="7" ry="9" fill="#faf9f4" stroke="#a3aaa2"/>`+box(w-23,y,15,10);}
 if(r.type==='parking'){let n=r.name.startsWith('2')?2:1;for(let i=0;i<n;i++){let cw=Math.min(31,(w-15)/n-5),ch=Math.min(h*.59,65),x=w/2-(n*cw+(n-1)*5)/2+i*(cw+5);s+=box(x,h*.34,cw,ch,7)+box(x+3,h*.34+9,cw-6,13,3)+box(x+3,h*.34+ch-15,cw-6,8);}}
 if(r.type==='garden')for(let i=0;i<3;i++)s+=`<circle cx="${w*(.22+i*.28)}" cy="${h*.67}" r="${Math.min(12,h*.19)}" fill="#b3c3a4" stroke="#809b76"/><path d="M${w*(.22+i*.28)-5},${h*.67}h10" stroke="#809b76"/>`;
 if(r.type==='staircase'){for(let i=0;i<8;i++)s+=box(9,h*.43+i*(h*.48/8),w-18,h*.48/8,0);s+=`<path d="M${w/2},${h*.9}V${h*.46}l-4,6m4,-6l4,6" fill="none" stroke="#657570"/>`;}
 return s;
}
window.buildFloorPlanSVG=function(r){
 const pw=r.plotLength*8,ph=r.plotWidth*8,rooms=planRooms(r,pw,ph,5),scale=Math.min(490/pw,620/ph),x=70,y=155,W=1000,H=Math.max(860,ph*scale+290,rooms.length*23+575),dw=pw*scale,dh=ph*scale;
 const text=(x,y,t,size=12,col='#263e38',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${col}" ${extra}>${esc(t)}</text>`;
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="font-family:Arial,sans-serif" role="img" aria-label="Furnished conceptual residential floor plan"><rect width="1000" height="${H}" fill="#faf9f4"/><rect x="24" y="24" width="952" height="${H-48}" fill="none" stroke="#c9cdc3"/><rect x="40" y="43" width="5" height="54" fill="#b99a4b"/>`;
 s+=text(60,56,'OH I SEE  /  DESIGN STUDIO',11,'#68756d','letter-spacing="2"')+text(60,85,'A place to call home.',27)+text(60,108,'Residential concept · '+r.style,11,'#68756d');
 s+=text(930,57,'CONCEPT STUDY',10,'#68756d','text-anchor="end" letter-spacing="2"')+text(930,83,'01 / FLOOR PLAN',17,'#263e38','text-anchor="end"')+text(930,106,r.plotLength+' × '+r.plotWidth+' FT SITE',11,'#68756d','text-anchor="end"');
 s+=`<path d="M40 123H960" stroke="#c9cdc3"/><g transform="translate(${x},${y}) scale(${scale})"><rect width="${pw}" height="${ph}" fill="#f4f1e9" stroke="#263e38" stroke-width="5"/>`;
 for(const room of rooms){const label=room.name,font=Math.min(10,room.h*.20,room.w/(label.length*.62));s+=`<g data-room="${room.type}" transform="translate(${room.x},${room.y})"><rect width="${room.w}" height="${room.h}" fill="${colors[room.type]}" stroke="${room.type==='corridor'?'#f4f1e9':'#344840'}" stroke-width="2.6"/>`;
 if(room.type!=='corridor'){s+=furniture(room);s+=text(room.w/2,Math.min(21,room.h*.25),label.toUpperCase(),font,'#263e38','text-anchor="middle" font-weight="600"')+text(room.w/2,Math.min(34,room.h*.41),(room.w/8).toFixed(1)+'′ × '+(room.h/8).toFixed(1)+'′',Math.min(8,room.h*.15),'#68756d','text-anchor="middle"');
 if(room.side){const dx=room.side==='left'?room.w:0,door=Math.min(23,room.h*.36),dy=room.h-door-4,dir=room.side==='left'?-1:1;s+=`<path d="M${dx} ${dy}v${door}" stroke="#faf9f4" stroke-width="4"/><path d="M${dx} ${dy}h${dir*door} M${dx+dir*door} ${dy}Q${dx+dir*door} ${dy+door} ${dx} ${dy+door}" fill="none" stroke="#829187" stroke-width=".8"/>`;const wx=room.side==='left'?0:room.w;s+=`<path d="M${wx} ${room.h*.4}v${room.h*.3}" stroke="#faf9f4" stroke-width="5"/><path d="M${wx-1} ${room.h*.4}v${room.h*.3}m2 0v-${room.h*.3}" stroke="#799aa3" stroke-width="1"/>`;}
 }s+='</g>';}
 s+=`<path d="M${pw/2-12} 0h24" stroke="#faf9f4" stroke-width="7"/><path d="M${pw/2-12} 0v23m0 0q24 0 24 -23" fill="none" stroke="#829187" stroke-width="1"/>`;
 s+='</g>';
 s+=`<path d="M${x} ${y-10}v-15m0 8h${dw}m0 -8v15 M${x+dw+12} ${y}h18m-9 0v${dh}m-9 0h18" fill="none" stroke="#829187"/>`+text(x+dw/2,y-14,r.plotLength+'′ – 0″',11,'#53665b','text-anchor="middle"')+text(x+dw+34,y+dh/2,r.plotWidth+'′ – 0″',11,'#53665b',`transform="rotate(90 ${x+dw+34} ${y+dh/2})" text-anchor="middle"`);
 s+=text(x+dw/2,y+dh+27,'REAR OF SITE',9,'#68756d','text-anchor="middle" letter-spacing="2"')+text(670,164,'THE HOME AT A GLANCE',12,'#263e38','letter-spacing="1.6"');
 s+=text(670,195,(r.plotLength*r.plotWidth).toLocaleString()+' sq.ft',26)+text(670,215,'Plot area · '+r.bedrooms+' bedrooms · '+r.bathrooms+' bathrooms',11,'#68756d')+text(670,238,'Road facing: '+r.roadFacing,11,'#68756d');
 s+=`<path d="M670 256H932" stroke="#c9cdc3"/>`+text(670,280,'ROOM SCHEDULE',11,'#68756d','letter-spacing="1.5"');
 rooms.filter(a=>!['garden','corridor'].includes(a.type)).forEach((room,i)=>{const yy=303+i*23;s+=text(670,yy,room.name,11)+text(928,yy,Math.round(room.w*room.h/64)+' sq.ft',11,'#68756d','text-anchor="end"')+`<path d="M670 ${yy+8}H932" stroke="#e3e5dc"/>`;});
 const note=303+rooms.filter(a=>!['garden','corridor'].includes(a.type)).length*23+32;
 s+=text(670,note,'MATERIAL PALETTE',10,'#68756d','letter-spacing="1.5"');['living','bedroom','kitchen'].forEach((t,i)=>s+=`<rect x="${670+i*88}" y="${note+15}" width="74" height="22" rx="3" fill="${colors[t]}"/>`+text(670+i*88,note+54,['Warm stone','Soft sage','Cool mineral'][i],9,'#68756d'));
 s+=text(670,note+87,'Furniture illustrates use and circulation.',10,'#68756d')+text(670,note+104,'Dimensions are indicative clear room sizes.',10,'#68756d');
 s+=`<path d="M40 ${H-85}H960" stroke="#c9cdc3"/>`+text(60,H-58,'OH I SEE',15,'#263e38','font-weight="700"')+text(60,H-39,'Thoughtfully planned. Beautifully presented.',10,'#68756d')+text(935,H-59,'PRELIMINARY · GROUND FLOOR CONCEPT',10,'#68756d','text-anchor="end"')+text(935,H-39,'Architect review required before construction. Not to print scale.',10,'#68756d','text-anchor="end"');
 return s+'</svg>';
};
window.validateLayout=function(r){const rooms=planRooms(r,r.plotLength*8,r.plotWidth*8,5),inside=rooms.every(a=>a.x>=0&&a.y>=0&&a.x+a.w<=r.plotLength*8&&a.y+a.h<=r.plotWidth*8),compact=rooms.some(a=>!['corridor','garden'].includes(a.type)&&Math.min(a.w,a.h)<48);return [{status:inside?'pass':'fail',text:inside?'All rooms contained within site':'Review site boundaries'},{status:'pass',text:rooms.filter(a=>a.type==='bedroom').length+' bedrooms included'},{status:'pass',text:rooms.filter(a=>a.type==='bathroom').length+' bathrooms included'},{status:compact?'warn':'pass',text:compact?'Compact spaces — review room sizes':'Room schedule included'},{status:'warn',text:r.floors>1?'Ground floor concept shown; upper floors require separate planning':'Concept design · architect review required'}];};
})();
