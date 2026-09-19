'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function controller(){
 let changed=false;
 const auth={getUser:async()=>({data:{user:null},error:{message:'invalid token'}}),admin:{updateUserById:async()=>{changed=true;return {error:null};}}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/controllers/authController'),'utf8'),{module,exports:module.exports,Buffer,process,console,require:id=>{
  if(id==='express-validator')return {validationResult:()=>({isEmpty:()=>true})};
  if(id==='@supabase/supabase-js')return {createClient:()=>({auth})};
  if(id==='../config/supabase')return {};
  if(id==='ws')return {};
  if(id==='../services/contractorProfile')return {ensureContractorProfile:async()=>null};
  if(id==='../services/userProfileStore')return {mergeUserProfile:u=>u};
  return require(id);
 }});
 return {handlers:module.exports,changed:()=>changed};
}
function response(){return {code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
test('signup rejects client-assigned privileged roles before database access',async()=>{
 const c=controller(),res=response();await c.handlers.signup({body:{name:'Test',email:'test@example.test',password:'abcdefgh',role:'Super Admin'}},res);assert.equal(res.code,400);
});
test('unsigned password reset token cannot reach admin password update',async()=>{
 const c=controller(),res=response(),payload=Buffer.from(JSON.stringify({sub:'victim'})).toString('base64url');
 await c.handlers.resetPassword({body:{access_token:'unsigned.'+payload+'.fake',new_password:'abcdefgh'}},res);
 assert.equal(res.code,401);assert.equal(c.changed(),false);
});

