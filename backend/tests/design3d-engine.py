"""Bounded geometry regression test; deliberately does not render or publish a job."""
import bpy, json, sys, pathlib, importlib.util
root=pathlib.Path(__file__).resolve().parents[2]
module_spec=importlib.util.spec_from_file_location('engine',root/'backend/blender/construction_engine.py')
module=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(module)
m=json.loads((root/'output/design3d-tests/bridge-engine/manifest.json').read_text())
m['baseFile']=str(root/'output/design3d-tests/bridge-engine/project.blend')
m['previousSpecification']=json.loads(json.dumps(m['specification']))
m['specification']['features']['swimmingPool']=False
m['specification']['materials']['exterior']='cream_stone'
m['outputDirectory']=str(root/'output/design3d-tests/incremental')
m['progressFile']=str(pathlib.Path(m['outputDirectory'])/'progress.json')
original=bpy.context.window.scene
class GeometryTestEngine(module.ConstructionEngine):
    def render_scene(self):pass
    def export_model(self):pass
engine=GeometryTestEngine(m)
foundation=engine.collections['FOUNDATION'].objects[0]
mesh=foundation.data.as_pointer()
assert len(engine.collections['POOL'].objects)>0
engine.build()
assert foundation.data.as_pointer()==mesh,'Unaffected foundation rebuilt'
assert len(engine.collections['POOL'].objects)==0,'Pool removal failed'
assert tuple(engine.materials['stone'].diffuse_color)[:3] != (.83,.84,.8)
assert original in bpy.data.scenes[:],'Unrelated scene removed'
bpy.context.window.scene=original
print('PASS: incremental pool removal and material edit retain foundation and unrelated scene')
