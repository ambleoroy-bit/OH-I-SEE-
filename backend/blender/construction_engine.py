"""OH I SEE deterministic construction engine. Accepts data, never AI-generated code."""
import bpy, json, math, os, sys, traceback, hashlib
from pathlib import Path
from mathutils import Vector

FT=.3048
class ConstructionEngine:
    def __init__(self, manifest):
        self.m=manifest; self.s=manifest['specification'];self.out=Path(manifest['outputDirectory']);self.out.mkdir(parents=True,exist_ok=True)
        self.files={};self.collections={};self.cache={};self.floor_h=self.s['building']['floorHeight'];self.floors=self.s['building']['floors']
        self.name='OH_I_SEE_PROJECT_'+manifest['projectId'];self.scene=None
        if manifest.get('baseFile'):
            with bpy.data.libraries.load(manifest['baseFile'],link=False) as (source,target):
                target.scenes=[n for n in source.scenes if n.startswith(self.name)][:1]
            self.scene=next((s for s in target.scenes if s),None)
            if not self.scene:raise ValueError('Saved project scene is missing')
        if not self.scene:self.scene=bpy.data.scenes.new(self.name)
        self.scene['projectId']=manifest['projectId'];self.scene['versionId']=manifest['versionId'];self.scene.unit_settings.system='METRIC'
        self.original_scene=bpy.context.window.scene if bpy.context.window else None
        if bpy.context.window:bpy.context.window.scene=self.scene
        for c in self.scene.collection.children:self.collections[c.name.split('|')[-1]]=c
        area=self.s['building']['builtUpArea']*.092903/self.floors
        self.w=math.sqrt(area*1.16);self.d=area/self.w
        if self.s['layout']:
            self.w=max(r['x']+r['width'] for r in self.s['layout'])+.4;self.d=max(r['y']+r['depth'] for r in self.s['layout'])+.4
        plot=self.s['plot'];pa=(plot['area'] or self.s['building']['builtUpArea']*1.3)*.092903
        self.pw=plot['width']*FT if plot['width'] else max(self.w+2,math.sqrt(pa*.84))
        self.pd=plot['depth']*FT if plot['depth'] else pa/self.pw
        if self.pd < self.d+6:raise ValueError('The plot needs more depth for the requested entrance and outdoor features. Please increase the plot size or reduce the building area.')
        if plot['width'] and self.w>self.pw-1:raise ValueError('Building does not fit the provided plot width')
        if plot['depth'] and self.d>self.pd-2:raise ValueError('Building does not fit the provided plot depth')
        self.rooms=self.plan();self.materials={};self.material_setup()
    def progress(self,status,value,message,**extra):
        self.last_stage=status
        data=dict(status=status,progress=value,message=message,files=self.files,**extra)
        p=Path(self.m['progressFile']);tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(data),encoding='utf8');os.replace(tmp,p)
    def collection(self,name):
        if name not in self.collections:
            c=bpy.data.collections.new(self.name+'|'+name);self.scene.collection.children.link(c);self.collections[name]=c
        self.current=self.collections[name];return self.current
    def clear(self,names):
        for name in names:
            c=self.collections.get(name)
            if c:
                for o in list(c.objects):bpy.data.objects.remove(o,do_unlink=True)
    def box(self,name,p,d,mat='stone',bevel=.025):
        x,y,z=(v/2 for v in d)
        if min(d)<=0:return None
        verts=[(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)]
        faces=[(2,6,4,0),(5,7,3,1),(4,5,1,0),(3,7,6,2),(1,3,2,0),(6,7,5,4)]
        key=('box',tuple(round(v,4) for v in d),mat)
        mesh=self.cache.get(key)
        if mesh is None:
            mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(self.materials[mat]);mesh.update();self.cache[key]=mesh
        o=bpy.data.objects.new(name,mesh);self.current.objects.link(o);o.location=p
        if bevel:
            mod=o.modifiers.new('Crafted edges','BEVEL');mod.width=min(bevel,min(d)/4);mod.segments=2
            o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
        return o
    def cylinder(self,name,p,r,h,mat='metal',r2=None,n=20):
        r2=r if r2 is None else r2;key=('cylinder',r,h,r2,n,mat);mesh=self.cache.get(key)
        if mesh is None:
            v=[(rad*math.cos(i*math.tau/n),rad*math.sin(i*math.tau/n),z) for rad,z in [(r,-h/2),(r2,h/2)] for i in range(n)]
            f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
            mesh=bpy.data.meshes.new(name);mesh.from_pydata(v,[],f);mesh.materials.append(self.materials[mat]);mesh.update();self.cache[key]=mesh
            for poly in list(mesh.polygons)[2:]:poly.use_smooth=True
        o=bpy.data.objects.new(name,mesh);self.current.objects.link(o);o.location=p;return o
    def line(self,name,points,r=.025,mat='metal'):
        cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2
        sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
        for p,co in zip(sp.points,points):p.co=(*co,1)
        cu.materials.append(self.materials[mat]);o=bpy.data.objects.new(name,cu);self.current.objects.link(o);return o
    def material_setup(self):
        palette={'stone':(.72,.7,.64),'marble':(.8,.81,.78),'wood':(.24,.12,.055),'metal':(.18,.2,.21),'gold':(.55,.34,.11),'glass':(.9,.95,.98),'fabric':(.12,.23,.23),'linen':(.77,.71,.59),'ceramic':(.83,.83,.77),'grass':(.075,.18,.055),'leaf':(.035,.115,.038),'paving':(.23,.24,.23),'water':(.04,.22,.3),'lamp':(1,.7,.35),'black':(.012,.018,.024)}
        palette['stone']={'white_marble':(.83,.84,.8),'cream_stone':(.72,.66,.55),'white_plaster':(.8,.8,.76),'brick':(.4,.18,.1)}[self.s['materials']['exterior']]
        palette['wood']=(.47,.28,.13) if self.s['materials']['interior']=='light_wood' else (.16,.065,.025)
        for key,col in palette.items():
            name=self.name+' material '+key;m=next((m for m in bpy.data.materials if m.name.startswith(name) and m.users and any(m in o.data.materials[:] for o in self.scene.objects if o.type=='MESH')),None)
            if not m:m=bpy.data.materials.new(name)
            m.use_nodes=True;m.diffuse_color=(*col,1);nt=m.node_tree;nt.nodes.clear();bs=nt.nodes.new('ShaderNodeBsdfPrincipled');out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
            bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Roughness'].default_value=.48
            if key in ['metal','gold']:bs.inputs['Metallic'].default_value=.8;bs.inputs['Roughness'].default_value=.25
            if key in ['glass','water']:bs.inputs['Transmission Weight'].default_value=.98;bs.inputs['Roughness'].default_value=.06;bs.inputs['IOR'].default_value=1.45 if key=='glass' else 1.333
            if key=='lamp':bs.inputs['Emission Color'].default_value=(1,.6,.22,1);bs.inputs['Emission Strength'].default_value=4
            if key in ['marble','wood','fabric','stone','grass']:
                tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=4 if key in ['wood','marble'] else 45
                bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.025;nt.links.new(tex.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],bs.inputs['Normal'])
            self.materials[key]=m
    def apply_material(self,obj,key):obj.data.materials.clear();obj.data.materials.append(self.materials[key])
    def plan(self):
        if self.s['layout']:return [dict(r,x=r['x']-self.w/2+.2,y=r['y']-self.d/2+.2) for r in self.s['layout']]
        counts=self.s['rooms'];floors=[[] for _ in range(self.floors)]
        for typ,key in [('living','livingRooms'),('dining','diningRooms'),('kitchen','kitchens')]:
            for i in range(counts[key]):floors[0].append((typ,f'{typ}_{i}'))
        for i in range(counts['bedrooms']):floors[0 if i==0 else min(self.floors-1,1+(i-1)%max(1,self.floors-1))].append(('bedroom',f'bedroom_{i}'))
        for i in range(counts['bathrooms']):floors[i%self.floors].append(('bathroom',f'bathroom_{i}'))
        if self.floors>1:floors[1].append(('lounge','upper_lounge'))
        rooms=[];corridor=2.2 if self.floors>1 else 1.3;cw=(self.w-corridor-.5)/2
        for floor,types in enumerate(floors):
            columns=[types[::2],types[1::2]]
            for side,column in enumerate(columns):
                weights=[{'living':1.8*self.s['layoutPreferences']['livingRoomScale'],'bedroom':1.35,'bathroom':.65,'kitchen':1.25}.get(t,1) for t,_ in column];total=sum(weights)
                y=-self.d/2+.25
                for (typ,id),weight in zip(column,weights):
                    depth=(self.d-.5)*weight/total
                    if depth<1.4 or cw<2:raise ValueError('Too many rooms for this floor area. Increase the built-up area or reduce room counts.')
                    rooms.append(dict(id=id,type=typ,floor=floor,x=-self.w/2+.25 if side==0 else corridor/2+.05,y=y,width=cw,depth=depth));y+=depth
        return rooms
    def create_wall(self,name,axis,fixed,start,end,z,height,openings=(),thickness=.2):
        # Substrate tessellation around true apertures: no opaque panel behind a door/window.
        xs=sorted(set([start,end]+[max(start,min(end,a)) for op in openings for a in [op[0],op[1]]]))
        zs=sorted(set([0,height]+[max(0,min(height,a)) for op in openings for a in [op[2],op[3]]]))
        for a,b in zip(xs,xs[1:]):
            for low,high in zip(zs,zs[1:]):
                if any(l<=(a+b)/2<=r and lo<=(low+high)/2<=hi for l,r,lo,hi in openings):continue
                p=((a+b)/2,fixed,z+(low+high)/2) if axis=='x' else (fixed,(a+b)/2,z+(low+high)/2)
                d=(b-a,thickness,high-low) if axis=='x' else (thickness,b-a,high-low)
                self.box(name,p,d,'stone',.008)
    def create_window(self,x,y,z,w,h,axis='x'):
        def p(a,b,c):return (x+a,y+b,z+c) if axis=='x' else (x+b,y+a,z+c)
        def d(a,b,c):return (a,b,c) if axis=='x' else (b,a,c)
        self.box('Clear window glass',p(0,0,h/2),d(w,.025,h),'glass',0)
        for a in [-w/2,0,w/2]:self.box('Window metal mullion',p(a,0,h/2),d(.045,.09,h),'metal',.004)
        for c in [0,h]:self.box('Window lintel and sill',p(0,0,c),d(w+.12,.25,.075),'metal',.006)
    def create_door(self,x,y,z,w=1,h=2.3,axis='x',glass=False):
        def p(a,b,c):return (x+a,y+b,z+c) if axis=='x' else (x+b,y+a,z+c)
        def d(a,b,c):return (a,b,c) if axis=='x' else (b,a,c)
        for a in [-w/2,w/2]:self.box('Door jamb',p(a,0,h/2),d(.08,.26,h),'wood',.012)
        self.box('Door lintel',p(0,0,h),d(w+.16,.26,.09),'wood',.012)
        if glass:self.create_window(x,y,z,w-.1,h-.05,axis)
    def create_foundation(self):
        self.collection('FOUNDATION');self.box('Raised stone foundation',(0,0,.2),(self.w+.5,self.d+.5,.4))
        for i in range(3):self.box('Entry step',(0,-self.d/2-.4-i*.25,.075*(3-i)),(2.8,1.2-i*.3,.15*(3-i)),'stone',.02)
    def create_floor(self,f):
        self.collection('GROUND_FLOOR' if f==0 else 'FLOOR_'+str(f));z=.4+f*self.floor_h
        self.box('Floor slab left',(-self.w/4-.55,0,z-.08),(self.w/2-1.1,self.d,.16),'marble')
        self.box('Floor slab right',(self.w/4+.55,0,z-.08),(self.w/2-1.1,self.d,.16),'marble')
        if f==0:self.box('Entrance hall floor',(0,0,z-.08),(2.2,self.d,.16),'marble')
        else:
            self.box('Upper corridor walkway',(-.55,0,z-.08),(1.1,self.d,.16),'marble')
            for y,d in [(-self.d/2+(self.d/2-2.2)/2,self.d/2-2.2),(2.5+(self.d/2-2.5)/2,self.d/2-2.5)]:
                if d>0:self.box('Stairwell landing',(.55,y,z-.08),(1.1,d,.16),'marble')
        self.collection('WINDOWS')
        for side in [-1,1]:
            y=side*self.d/2;opens=[]
            for x in [-self.w*.3,self.w*.3]:
                w=min(2.5,self.w*.26);balcony_door=f>0 and side==-1 and self.s['features']['balconyCount']>0
                sill=0 if balcony_door else .65;opens.append((x-w/2,x+w/2,sill,self.floor_h-.4))
                if balcony_door:self.create_door(x,y,z,w,self.floor_h-.4,glass=True)
                else:self.create_window(x,y,z+.65,w,self.floor_h-1.05)
            opens.append((-.65,.65,0 if f==0 else .8,2.35))
            if f==0:self.create_door(0,y,z,1.3,2.35,glass=True)
            else:self.create_window(0,y,z+.8,1.3,1.55)
            self.collection('GROUND_FLOOR' if f==0 else 'FLOOR_'+str(f));self.create_wall('Facade wall','x',y,-self.w/2,self.w/2,z,self.floor_h,opens);self.collection('WINDOWS')
        for side in [-1,1]:
            x=side*self.w/2;opens=[]
            for y in [-self.d*.28,self.d*.28]:
                opens.append((y-.85,y+.85,.85,self.floor_h-.45));self.create_window(x,y,z+.85,1.7,self.floor_h-1.3,'y')
            self.collection('GROUND_FLOOR' if f==0 else 'FLOOR_'+str(f));self.create_wall('Side wall','y',x,-self.d/2,self.d/2,z,self.floor_h,opens);self.collection('WINDOWS')
        self.collection('GROUND_FLOOR' if f==0 else 'FLOOR_'+str(f))
        for y in [-self.d/2,self.d/2]:self.box('Continuous slab fascia',(0,y,z+self.floor_h-.03),(self.w+.45,.35,.18),'stone')
    def create_room(self,r):
        z=.4+r['floor']*self.floor_h;x,y,w,d=r['x'],r['y'],r['width'],r['depth'];self.collection('GROUND_FLOOR' if r['floor']==0 else 'FLOOR_'+str(r['floor']))
        self.box(r['id']+' finished floor',(x+w/2,y+d/2,z+.017),(w-.05,d-.05,.035),self.s['materials']['flooring'],.005)
        side=x+w if x<0 else x;door=y+min(d/2,1.1)
        self.create_wall(r['id']+' corridor wall','y',side,y,y+d,z,self.floor_h,[(door-.45,door+.45,0,2.2)],.12)
        if y>-self.d/2+.3:self.create_wall(r['id']+' partition','x',y,x,x+w,z,self.floor_h,[],.12)
        self.create_door(side,door,z,.9,2.2,'y')
    def create_staircase(self):
        if self.floors<2:return
        self.collection('STAIRS');run=4.4;count=22
        for f in range(self.floors-1):
            z=.4+f*self.floor_h
            for i in range(count):
                h=(i+1)*self.floor_h/count;y=-2.2+(i+.5)*run/count
                self.box('Stair tread',(.55,y,z+h-.06),(.95,run/count,.12),'wood',.008)
                self.line('Stair baluster',[(.1,y,z+h),(.1,y,z+h+.9)],.014)
            self.line('Stair handrail',[(.1,-2.1,z+1),(.1,2.1,z+self.floor_h+.9)],.035,'wood')
            self.line('Structural stair stringer',[(.55,-2.1,z),(.55,2.1,z+self.floor_h-.15)],.11,'metal')
    def create_roof(self):
        self.collection('ROOF');z=.4+self.floors*self.floor_h;self.box('Insulated flat roof',(0,0,z),(self.w+.4,self.d+.4,.22),'stone')
        for x in [-self.w/2,self.w/2]:self.box('Roof parapet',(x,0,z+.3),(.16,self.d,.6),'stone')
        for y in [-self.d/2,self.d/2]:self.box('Roof parapet',(0,y,z+.3),(self.w,.16,.6),'stone')
        # Timber screen, deep entrance canopy and vertical facade fins.
        for i in range(8):self.box('Entrance timber screen',(-self.w/2+.4+i*.13,-self.d/2-.13,1.9),(.06,.16,2.7),'wood',.01)
        self.box('Entrance canopy',(0,-self.d/2-.55,2.95),(2.65,1.3,.17),'stone')
        if self.s['building']['style']=='traditional':self.create_dome(0,0,z+.1,min(self.w,self.d)*.22)
    def create_column(self,x,y,z,h):self.cylinder('Architectural column',(x,y,z+h/2),.16,h,'stone')
    def create_dome(self,x,y,z,r):
        points=[]
        for i in range(17):a=i*math.pi/32;points.append((r*math.cos(a),r*math.sin(a)))
        v=[(x+rr*math.cos(k*math.tau/48),y+rr*math.sin(k*math.tau/48),z+zz) for rr,zz in points for k in range(48)]
        f=[(j*48+k,j*48+(k+1)%48,(j+1)*48+(k+1)%48,(j+1)*48+k) for j in range(16) for k in range(48)]
        me=bpy.data.meshes.new('Dome');me.from_pydata(v,[],f);me.materials.append(self.materials['metal']);o=bpy.data.objects.new('Traditional dome',me);self.current.objects.link(o)
    def create_balcony(self):
        self.collection('BALCONIES');n=self.s['features']['balconyCount']
        for i in range(n):
            floor=1+i//2;floor=min(floor,self.floors-1);x=(-1 if i%2==0 else 1)*self.w*.28;w=self.w*.35;depth=self.s['layoutPreferences']['balconyDepth'];y=-self.d/2-depth/2;z=.4+floor*self.floor_h
            self.box('Balcony slab',(x,y,z-.06),(w,depth,.16),'stone');self.box('Glass balcony rail',(x,y-depth/2,z+.52),(w,.025,1),'glass',0)
            self.line('Balcony handrail',[(x-w/2,y-depth/2,z+1.05),(x+w/2,y-depth/2,z+1.05)],.03)
            for xx in [x-w/2,x+w/2]:self.box('Balcony side glass',(xx,y,z+.52),(.025,depth,1),'glass',0)
    def create_pool(self):
        self.collection('POOL')
        if not self.s['features']['swimmingPool']:return
        x=-self.pw*.24;y=-self.d/2-3.0;w=min(4.8,self.pw*.43);d=2.4
        self.box('Pool stone surround',(x,y,.16),(w+.5,d+.5,.25),'stone');self.box('Pool turquoise water',(x,y,.295),(w,d,.02),'water',0)
        for xx in [x-w/2-.12,x+w/2+.12]:self.box('Pool coping',(xx,y,.33),(.24,d+.4,.15),'marble')
        for yy in [y-d/2-.12,y+d/2+.12]:self.box('Pool coping',(x,yy,.33),(w,.24,.15),'marble')
    def create_garden(self):
        self.collection('LANDSCAPE')
        if not self.s['features']['garden']:return
        for side in [-1,1]:
            x=side*(self.pw/2-.6)
            for y in [-self.d/2-3,0,self.d/2]:
                self.cylinder('Tree trunk',(x,y,1.4),.09,2.7,'wood')
                for j in range(5):self.cylinder('Layered foliage',(x+.2*math.sin(j),y+.2*math.cos(j),2.2+j*.25),.65-j*.05,.75,'leaf',.45-j*.04,10)
            self.box('Clipped garden hedge',(x,-self.d/2-2.5,.36),(.35,3,.65),'leaf',.12)
    def create_parking(self):
        self.collection('PARKING')
        if not self.s['features']['parking']:return
        x=self.pw*.25;y=-self.d/2-2.8;self.box('Parking bay',(x,y,.03),(2.7,4.6,.07),'paving')
        # Restrained carport with visible supports; no placeholder vehicle.
        self.box('Carport canopy',(x,y,2.7),(2.85,4.7,.12),'metal')
        for xx in [x-1.32,x+1.32]:
            for yy in [y-2.1,y+2.1]:self.create_column(xx,yy,0,2.65)
    def create_gate(self):
        self.collection('SITE');front=-self.d/2-5.6
        for side in [-1,1]:self.box('Boundary wall',(side*(self.pw/4+1),front,.55),(max(.1,self.pw/2-2),.18,1.1),'stone')
        for x in [-2,2]:self.box('Gate pier',(x,front,.8),(.35,.35,1.6),'stone')
        for i in range(16):self.box('Gate metal bar',(-1.9+i*.25,front, .75),(.03,.05,1.4),'metal',.003)
        for z in [.15,1.4]:self.box('Gate horizontal rail',(0,front,z),(3.9,.07,.04),'metal')
    def create_site(self):
        self.collection('SITE');self.box('Plot ground',(0,(self.pd-self.d-12)/2,-.09),(self.pw,self.pd,.16),'grass')
        self.box('Entrance paving',(0,-self.d/2-2.8,.005),(self.pw-1,5.7,.08),'paving')
        self.box('Surrounding ground',(0,0,-.23),(300,300,.1),'grass',0);self.create_gate()
    def table(self,x,y,z,w=1.3,d=.65,h=.45):
        self.box('Table top',(x,y,z+h),(w,d,.09),'marble')
        for dx in [-w*.4,w*.4]:
            for dy in [-d*.35,d*.35]:self.cylinder('Table leg',(x+dx,y+dy,z+h/2),.025,h,'metal')
    def sofa(self,x,y,z,w=2.2):
        self.box('Sofa frame',(x,y,z+.26),(w,.85,.22),'wood');self.box('Sofa back',(x,y+.33,z+.65),(w,.2,.8),'fabric',.08)
        for dx in [-w/2+.1,w/2-.1]:self.box('Sofa arm',(x+dx,y,z+.5),(.2,.9,.45),'fabric',.07)
        for i in range(3):self.box('Sofa seat cushion',(x+(i-1)*(w-.4)/3,y-.07,z+.47),((w-.45)/3,.65,.18),'fabric',.06)
        for dx in [-w*.4,w*.4]:
            for dy in [-.28,.28]:self.cylinder('Sofa foot',(x+dx,y+dy,z+.1),.03,.2,'metal')
    def create_living_room(self,r):
        x=r['x']+r['width']/2;y=r['y']+r['depth']/2;z=.43+r['floor']*self.floor_h
        self.box('Living woven rug',(x,y,z+.012),(min(2.8,r['width']-.2),min(2.5,r['depth']-.2),.018),'linen',.005)
        self.sofa(x,y+.55,z,min(2.6,r['width']-.3));self.table(x,y-.6,z)
        self.box('TV media console',(x,r['y']+.25,z+.3),(min(1.8,r['width']-.3),.36,.6),'wood')
        self.box('Living display',(x,r['y']+.12,z+1.35),(1.25,.055,.72),'black')
    def create_bedroom(self,r):
        x=r['x']+r['width']/2;y=r['y']+r['depth']/2;z=.43+r['floor']*self.floor_h
        self.box('Bed platform',(x,y,z+.2),(1.65,2.1,.36),'wood',.06);self.box('Mattress',(x,y,z+.46),(1.6,2,.24),'linen',.09)
        self.box('Velvet headboard',(x,y+.99,z+.85),(1.85,.14,1.45),'fabric',.04)
        for dx in [-.4,.4]:self.box('Bed pillow',(x+dx,y+.62,z+.64),(.65,.42,.13),'linen',.06)
        self.box('Bed cover',(x,y-.35,z+.62),(1.61,1.25,.09),'fabric',.05)
        self.box('Bedroom wardrobe',(r['x']+.38,r['y']+.7,z+1.15),(.65,1.15,2.3),'wood')
        for dx in [-1.08,1.08]:self.box('Nightstand',(x+dx,y+.65,z+.26),(.42,.44,.52),'wood')
    def create_kitchen(self,r):
        z=.43+r['floor']*self.floor_h;x=r['x']+r['width']/2;y=r['y']+r['depth']-.5
        for i in range(max(2,int((r['width']-.3)/.65))):
            xx=r['x']+.45+i*.65;self.box('Kitchen base cabinet',(xx,y,z+.45),(.62,.62,.9),'wood');self.box('Cabinet handle',(xx,y-.34,z+.73),(.22,.035,.02),'gold');self.box('Upper cabinet',(xx,y+.1,z+1.8),(.62,.4,.7),'stone')
        self.box('Kitchen stone worktop',(x,y,z+.95),(r['width']-.2,.7,.1),'marble')
        self.box('Induction cooktop',(x+.35,y,z+1.01),(.65,.46,.02),'black',.006)
        self.box('Sink inset',(x-.65,y,z+1.01),(.45,.42,.02),'metal',.035)
        self.line('Kitchen faucet',[(x-.65,y+.22,z+1),(x-.65,y+.22,z+1.35),(x-.65,y,z+1.38),(x-.65,y,z+1.2)],.02,'metal')
    def create_furniture(self):
        for r in self.rooms:
            self.collection('BATHROOMS' if r['type']=='bathroom' else 'KITCHEN' if r['type']=='kitchen' else 'FURNITURE')
            if r['type'] in ['living','lounge']:self.create_living_room(r)
            elif r['type']=='bedroom':self.create_bedroom(r)
            elif r['type']=='kitchen':self.create_kitchen(r)
            elif r['type']=='dining':
                x=r['x']+r['width']/2;y=r['y']+r['depth']/2;z=.43+r['floor']*self.floor_h;self.table(x,y,z,1.6,.8,.75)
                for dx in [-.5,.5]:
                    for dy in [-.7,.7]:
                        self.box('Dining chair seat',(x+dx,y+dy,z+.43),(.43,.43,.1),'fabric');self.box('Dining chair back',(x+dx,y+dy+( .18 if dy>0 else -.18),z+.72),(.43,.07,.55),'fabric')
                        for xx in [-.16,.16]:
                            for yy in [-.16,.16]:self.cylinder('Chair leg',(x+dx+xx,y+dy+yy,z+.2),.018,.4,'wood')
            elif r['type']=='bathroom':
                x=r['x']+.55;y=r['y']+.65;z=.43+r['floor']*self.floor_h;self.cylinder('Ceramic toilet',(x,y,z+.22),.24,.44,'ceramic');self.box('Toilet cistern',(x,y+.24,z+.57),(.4,.2,.55),'ceramic');self.box('Vanity',(x+.75,y,z+.38),(.5,.48,.76),'wood');self.cylinder('Ceramic basin',(x+.75,y,z+.82),.23,.12,'ceramic')
    def create_lighting(self):
        self.collection('LIGHTING')
        world=bpy.data.worlds.new(self.name+' daylight');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.35,.47,.68,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35;self.scene.world=world
        sun=bpy.data.lights.new('Evening sun','SUN');sun.energy=2;sun.angle=.12;sun.color=(1,.8,.6);o=bpy.data.objects.new('Architectural sun',sun);self.current.objects.link(o);o.rotation_euler=(.55,-.4,-.4)
        if self.s['lighting']['timeOfDay']=='day':sun.color=(1,.94,.85);sun.energy=2.5
        for r in self.rooms:
            x=r['x']+r['width']/2;y=r['y']+r['depth']/2;z=.4+(r['floor']+1)*self.floor_h
            data=bpy.data.lights.new(r['id']+' warm ceiling','AREA');data.energy=120 if r['type']=='bathroom' else 220;data.shape='DISK';data.size=1.4;data.color=(1,.73,.45) if self.s['lighting']['style']=='warm_luxury' else (1,.94,.85)
            o=bpy.data.objects.new(r['id']+' ceiling light',data);self.current.objects.link(o);o.location=(x,y,z-.25)
            self.cylinder('Ceiling luminaire',(x,y,z-.12),.18,.055,'lamp')
            if r['type'] in ['living','dining']:
                self.line('Pendant suspension',[(x,y,z-.05),(x,y,z-.7)],.012,'gold')
                self.line('Chandelier hoop',[(x+.4*math.cos(i*math.tau/32),y+.4*math.sin(i*math.tau/32),z-.7) for i in range(33)],.025,'gold')
                for i in range(6):self.cylinder('Chandelier opal',(x+.4*math.cos(i*math.tau/6),y+.4*math.sin(i*math.tau/6),z-.76),.045,.2,'lamp')
        for x in [-self.w*.4,self.w*.4]:
            data=bpy.data.lights.new('Facade wash','AREA');data.energy=80;data.color=(1,.65,.3);data.size=1;o=bpy.data.objects.new('Facade wash',data);self.current.objects.link(o);o.location=(x,-self.d/2-1,.5);o.rotation_euler=(Vector((x,-self.d/2,2))-o.location).to_track_quat('-Z','Y').to_euler()
    def create_camera(self,name,p,target,lens=40):
        data=bpy.data.cameras.new(name);data.lens=lens;data.clip_end=500;o=bpy.data.objects.new(name,data);self.current.objects.link(o);o.location=p;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o['render_kind']=name;return o
    def cameras(self):
        self.collection('CAMERAS');distance=max(self.w,self.d)*2.6
        self.scene.camera=self.create_camera('exterior',(distance*.8,-distance,distance*.56),(0,-1,self.floors*self.floor_h*.45),42)
        for kind,typ in [('livingRoom','living'),('kitchen','kitchen'),('masterBedroom','bedroom')]:
            candidates=[r for r in self.rooms if r['type']==typ];r=max(candidates,key=lambda r:r['width']*r['depth']);z=.4+r['floor']*self.floor_h
            self.create_camera(kind,(r['x']+r['width']*.2,r['y']+.35,z+1.65),(r['x']+r['width']*.55,r['y']+r['depth']*.68,z+1.25),20)
    def save_project(self):
        path=str(self.out/'project.blend');self.scene['HouseSpecification']=json.dumps(self.s);self.scene['roomLayout']=json.dumps(self.rooms)
        bpy.data.libraries.write(path,{self.scene},fake_user=True,compress=True);self.files['project']=path
    def render_scene(self):
        available={x.identifier for x in self.scene.render.bl_rna.properties['engine'].enum_items}
        for candidate in ['CYCLES','BLENDER_EEVEE_NEXT','BLENDER_EEVEE']:
            try:self.scene.render.engine=candidate;break
            except (TypeError,ValueError):continue
        else:raise RuntimeError('No supported render engine: '+str(available))
        if self.scene.render.engine=='CYCLES':
            self.scene.cycles.samples=self.m['render']['samples'];self.scene.cycles.use_denoising=True
            try:
                pref=bpy.context.preferences.addons['cycles'].preferences
                for backend in ['OPTIX','CUDA','HIP','ONEAPI']:
                    try:
                        pref.compute_device_type=backend;pref.get_devices();gpu=[d for d in pref.devices if d.type==backend]
                        if gpu:
                            for d in pref.devices:d.use=d in gpu
                            self.scene.cycles.device='GPU';break
                    except Exception:continue
            except Exception:pass
        self.scene.render.resolution_x=self.m['render']['width'];self.scene.render.resolution_y=self.m['render']['height'];self.scene.render.resolution_percentage=100
        self.scene.render.image_settings.file_format='PNG';self.scene.render.image_settings.color_mode='RGB';self.scene.view_settings.view_transform='AgX';self.scene.view_settings.exposure=.35
        targets=['exterior']+(['livingRoom','kitchen','masterBedroom'] if self.m['render']['interiors'] else [])
        for i,kind in enumerate(targets):
            self.scene.camera=next(o for o in self.scene.objects if o.type=='CAMERA' and o.get('render_kind')==kind)
            self.scene.render.filepath=str(self.out/(kind+'.png'));self.progress('rendering',75+int(20*i/len(targets)),'Rendering '+kind)
            bpy.ops.render.render(write_still=True,scene=self.scene.name);self.files[kind]=self.scene.render.filepath
        self.scene.camera=next(o for o in self.scene.objects if o.type=='CAMERA' and o.get('render_kind')=='exterior')
    def export_model(self):
        if not self.m['render']['exportGlb']:return
        for o in self.scene.objects:o.select_set(o.type=='MESH' and not o.name.startswith('Surrounding ground'))
        file=str(self.out/'model.glb')
        options=dict(filepath=file,export_format='GLB',use_selection=True,export_apply=True)
        props={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
        if 'use_active_scene' in props:options['use_active_scene']=True
        bpy.ops.export_scene.gltf(**options)
        self.files['model']=file
    def build(self):
        previous=self.m.get('previousSpecification');structural=not previous or any(previous.get(k)!=self.s.get(k) for k in ['plot','building'])
        layout_changed=structural or any(previous.get(k)!=self.s.get(k) for k in ['rooms','layout']) or previous.get('layoutPreferences',{}).get('livingRoomScale')!=self.s['layoutPreferences']['livingRoomScale']
        self.progress('building',25,'Building architecture and rooms')
        if not self.m.get('renderOnly'):
            if structural:
                self.clear(list(self.collections));self.create_site();self.create_foundation()
            elif layout_changed:
                self.clear(['GROUND_FLOOR','FLOOR_1','FLOOR_2','WINDOWS','DOORS','FURNITURE','KITCHEN','BATHROOMS'])
            if layout_changed:
                for f in range(self.floors):self.create_floor(f)
                for r in self.rooms:self.create_room(r)
                self.create_furniture()
            if structural:self.create_roof();self.create_staircase()
            # Feature edits rebuild only their affected collection, retaining all other objects.
            for key,collection,fn in [('swimmingPool','POOL',self.create_pool),('garden','LANDSCAPE',self.create_garden),('parking','PARKING',self.create_parking),('balconyCount','BALCONIES',self.create_balcony)]:
                if structural or not previous or previous['features'].get(key)!=self.s['features'].get(key) or (key=='balconyCount' and previous['layoutPreferences']['balconyDepth']!=self.s['layoutPreferences']['balconyDepth']):self.clear([collection]);fn()
            self.progress('materials',55,'Applying marble, wood, glass and fabric')
            if previous and previous['materials']['flooring']!=self.s['materials']['flooring']:
                for o in self.scene.objects:
                    if 'finished floor' in o.name:self.apply_material(o,self.s['materials']['flooring'])
            if layout_changed or previous['lighting']!=self.s['lighting']:self.clear(['LIGHTING']);self.create_lighting()
            self.progress('lighting',65,'Composing architectural lighting and cameras')
            if layout_changed or not self.collections.get('CAMERAS'):self.clear(['CAMERAS']);self.cameras()
        self.save_project();self.export_model();self.save_project();self.render_scene();self.save_project()
        self.progress('completed',100,'Design complete')

def run_job(manifest_path):
    manifest=json.loads(Path(manifest_path).read_text(encoding='utf8'));engine=None
    original=bpy.context.window.scene if bpy.context.window else None
    try:
        engine=ConstructionEngine(manifest);engine.build()
    except Exception as exc:
        traceback.print_exc()
        if engine:
            try:engine.save_project()
            except Exception:pass
            render_failed=getattr(engine,'last_stage','building')=='rendering'
            engine.progress('failed',70,'3D model created, but rendering failed. Retry Render.' if render_failed else str(exc),code='RENDER_FAILED' if render_failed else 'BUILD_FAILED')
        else:Path(manifest['progressFile']).write_text(json.dumps({'status':'failed','progress':0,'message':str(exc),'code':'BUILD_FAILED','files':{}}))
    finally:
        if original and bpy.context.window:bpy.context.window.scene=original

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);run_job(args.manifest)
