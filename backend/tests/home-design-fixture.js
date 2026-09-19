'use strict';
// Isolated synthetic project; never used by the production server.
const path=require('node:path');
process.env.DESIGN3D_STORAGE_ROOT=path.resolve(__dirname,'../../output/home-design-test-storage');
process.env.DESIGN3D_STORAGE='local';
const {app,records,reset:resetRecords,token}=require('./marketplace-fixture');
const {fromProject}=require('../src/bim/generation/requirementsParser');
const {generate}=require('../src/bim/generation/requirementsToBim');
const {calculateQuantities}=require('../src/bim/calculations/quantities');
let snapshot;
function reset(){resetRecords();const p=records.projects[0];p.project_name='Courtyard House';p.project_type='Residential Villa';p.plot_length=40;p.plot_width=30;p.floors=2;p.bedrooms=3;p.bathrooms=2;p.updated_at='2026-09-18T00:00:00.000Z';p.construction_context={projectSetup:{project_name:p.project_name,floors:'G + 1',estimated_budget:'₹50,00,000'},landSite:{plot_length_ft:40,plot_width_ft:30},intentAnswers:{plot_length:'40',plot_width:'30',floors:'G + 1 Floor',bedrooms:'3 Bedrooms',bathrooms:'2',parking:'1 Car',road_facing:'East'}};const requirements=fromProject(p),model=generate(requirements).toJSON();snapshot={model,requirements,version:{id:'floor-plan-v1',version_number:1},validation:{valid:true,errors:[]},quantities:calculateQuantities(model),status:'ready'};}
reset();const modulePath=require.resolve('../src/services/bimService');require.cache[modulePath]={id:modulePath,filename:modulePath,loaded:true,exports:{getBimForProject:async(pid,user)=>pid==='P1'&&user==='c1'?structuredClone(snapshot):null}};
app.use('/api/projects/:projectId/home-designs',require('../src/routes/homeDesign'));
app.get('/api/projects/P1',(req,res)=>res.json({data:records.projects[0]}));
app.get('/api/projects/P1/bim',(req,res)=>res.json({data:snapshot}));
app.post('/api/projects/P1/bim/validate',(req,res)=>res.json({data:{valid:true,errors:[]}}));
app.get('/__test__/session',(req,res)=>res.json({token:token('c1')}));
app.get('/__test__/snapshot',(req,res)=>res.json(snapshot));
module.exports={app,records,reset,token};
if(require.main===module)app.listen(3109,'127.0.0.1',()=>console.log('Home design synthetic API listening on 3109'));