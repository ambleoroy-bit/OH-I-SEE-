/* Two drawing styles share the same requirements and room geometry. */
(() => {
const presentation=window.buildFloorPlanSVG;
let selected='architectural';
try{selected=localStorage.getItem('ohisee_blueprint_style')||selected;}catch{}
if(!['architectural','presentation'].includes(selected))selected='architectural';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function architectural(r){
 const source=new DOMParser().parseFromString(presentation(r),'image/svg+xml');
 const drawing=source.querySelector('svg > g');
 const pw=r.plotLength*8,ph=r.plotWidth*8,scale=Math.min(490/pw,740/ph),x=100,y=165,w=pw*scale,h=ph*scale;
 drawing.setAttribute('transform',`translate(${x},${y}) scale(${scale})`);
 drawing.querySelectorAll('*').forEach(el=>{const fill=el.getAttribute('fill'),stroke=el.getAttribute('stroke');if(fill&&fill!=='none')el.setAttribute('fill',el.tagName==='text'?'#262626':'#ffffff');if(stroke&&stroke!=='none'){el.setAttribute('stroke',stroke==='#829187'?'#677de0':stroke==='#799aa3'?'#51a5ba':stroke==='#faf9f4'?'#ffffff':'#8b8b8b');}if(el.getAttribute('stroke-width')==='2.6')el.setAttribute('stroke-width','1.3');});
 const t=(x,y,s,size=10,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="#333" ${extra}>${escape(s)}</text>`;
 const dim=(a,b,c,d,label)=>`<path d="M${a} ${b}L${c} ${d}" stroke="#df9292" stroke-width=".65"/><path d="M${a-3} ${b-3}l6 6M${c-3} ${d-3}l6 6" stroke="#d85656" stroke-width=".8"/>`+(b===d?t((a+c)/2,b-5,label,10,'text-anchor="middle"'):t(a+12,(b+d)/2,label,10,`text-anchor="middle" transform="rotate(-90 ${a+12} ${(b+d)/2})"`));
 let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1180" viewBox="0 0 1000 1180" style="font-family:Arial,sans-serif" role="img" aria-label="Architectural line drawing, conceptual ground floor"><rect width="1000" height="1180" fill="white"/><rect x="18" y="18" width="964" height="1144" fill="none" stroke="#aaa" stroke-width=".6"/>`;
 s+=t(65,65,'OH I SEE  /  ARCHITECTURAL DRAWING',15,'letter-spacing="1.4"')+t(65,86,'GROUND FLOOR · CONCEPT OPTION 01',10)+t(930,65,'A–101',17,'text-anchor="end"');
 s+=`<rect x="${x-23}" y="${y-23}" width="${w+46}" height="${h+46}" fill="none" stroke="#999" stroke-width=".8" stroke-dasharray="5 3"/>`;
 s+=new XMLSerializer().serializeToString(drawing);
 s+=dim(x,y-40,x+w,y-40,r.plotLength+'′–0″')+dim(x+w+48,y,x+w+48,y+h,r.plotWidth+'′–0″');
 s+=`<path d="M${x} ${y-3}V${y-49}M${x+w} ${y-3}V${y-49}M${x+w+3} ${y}H${x+w+56}M${x+w+3} ${y+h}H${x+w+56}" stroke="#df9292" stroke-width=".6"/>`;
 const rooms=planRooms(r,pw,ph,5),seen=new Set();
 rooms.filter(a=>a.side).forEach(room=>{const yy=y+room.y*scale,xx=x+room.x*scale,rw=room.w*scale,rh=room.h*scale;s+=dim(xx+7,yy+rh-6,xx+rw-7,yy+rh-6,(room.w/8).toFixed(1)+'′');for(const [px,py] of [[xx,yy],[xx+rw,yy]]){const key=px+','+py;if(!seen.has(key)){seen.add(key);s+=`<rect x="${px-3}" y="${py-3}" width="6" height="6" fill="#d94747"/>`;}}});
 s+=t(x+w/2,y+h+53,'GROUND FLOOR PLAN — OPTION 01',13,'text-anchor="middle"')+t(x+w/2,y-63,'ROAD SIDE / MAIN APPROACH · '+r.roadFacing,10,'text-anchor="middle"')+t(x,y+h+77,'Dashed perimeter: site / setback envelope to be confirmed.',9);
 const bx=725,by=485,bw=230;
 const northAngle={North:0,East:-90,South:180,West:90}[r.roadFacing];
 if(northAngle!==undefined)s+=`<g transform="translate(840,325) rotate(${northAngle})"><path d="M0 30V-25M0 -25l-6 14L0 -15l6 4Z" fill="white" stroke="#555" stroke-width="1"/><text x="0" y="-36" text-anchor="middle" font-size="12" fill="#333">N</text></g>`;
 s+=t(840,390,'Orientation based on road-facing input',9,'text-anchor="middle"');
 s+=`<rect x="${bx}" y="${by}" width="${bw}" height="600" fill="white" stroke="#888" stroke-width=".7"/>`;
 s+=t(bx+14,by+25,'DRAWING INFORMATION',10,'letter-spacing="1"');
 const fields=[['PROJECT','PROPOSED RESIDENCE'],['DRAWING TITLE','GROUND FLOOR CONCEPT'],['SITE DIMENSIONS',r.plotLength+' × '+r.plotWidth+' ft'],['ACCOMMODATION',r.bedrooms+' bedrooms / '+r.bathrooms+' bathrooms'],['ROAD FACING',r.roadFacing],['DRAWING / REVISION','A–101 / 01'],['SCALE','NTS · refer to written dimensions']];
 fields.forEach(([k,v],i)=>{let yy=by+43+i*53;s+=`<path d="M${bx} ${yy}h${bw}" stroke="#aaa" stroke-width=".6"/>`+t(bx+12,yy+17,k,8)+t(bx+12,yy+35,v,10);});
 s+=t(bx+12,by+447,'DRAWING KEY',9)+`<rect x="${bx+12}" y="${by+464}" width="6" height="6" fill="#d94747"/>`+t(bx+28,by+470,'Wall junctions · diagrammatic',9)+t(bx+12,by+490,'Blue: openings / door swings',9)+t(bx+12,by+509,'Red lines: dimension annotations',9)+t(bx+12,by+543,'Concept only. Not a structural drawing.',9)+t(bx+12,by+560,'Setbacks and structure require review.',9)+t(bx+12,by+585,'OH I SEE',17);
 s+=t(65,1120,'PRELIMINARY DESIGN · FOR CLIENT DISCUSSION',10,'letter-spacing="1"')+t(65,1138,'Room geometry is shared with Client Presentation. Professional review is required before construction.',9);
 return s+'</svg>';
}
window.buildFloorPlanSVG=r=>selected==='presentation'?presentation(r):architectural(r);
const holder=document.createElement('div');holder.className='bp-style-options';holder.setAttribute('role','group');holder.setAttribute('aria-label','Blueprint style');
holder.innerHTML='<button type="button" data-style="architectural"><span>01 / ARCHITECTURAL DRAWING</span><small>Fine linework, dimension annotations and drawing title block.</small></button><button type="button" data-style="presentation"><span>02 / CLIENT PRESENTATION</span><small>Your existing furnished plan, soft colours and room schedule.</small></button>';
const viewer=document.getElementById('bp-viewer');viewer.prepend(holder);
function sync(){holder.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.style===selected)));}
holder.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;selected=b.dataset.style;try{localStorage.setItem('ohisee_blueprint_style',selected);}catch{}sync();if(currentSVG){currentSVG=buildFloorPlanSVG(requirements);document.getElementById('bp-canvas-wrap').innerHTML=currentSVG;}});sync();
})();
