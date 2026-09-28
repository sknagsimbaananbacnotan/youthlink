const { createClient } = require('@supabase/supabase-js');

function sbServer(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) throw new Error('Missing Supabase server environment variables.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function authorize(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token) throw Object.assign(new Error('Unauthorized'),{statusCode:401});
 const sb=sbServer();
 const {data:{user},error}=await sb.auth.getUser(token);
 if(error||!user) throw Object.assign(new Error('Unauthorized'),{statusCode:401});
 const s=await sb.from('staff_profiles').select('role,active').eq('user_id',user.id).maybeSingle();
 if(s.error) throw s.error;
 if(!s.data?.active||!['admin','encoder'].includes(String(s.data.role||'').toLowerCase()))
   throw Object.assign(new Error('Forbidden'),{statusCode:403});
 return user;
}
module.exports=async(req,res)=>{
 try{
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  await authorize(req);
  const apiKey=process.env.SEMAPHORE_API_KEY;
  if(!apiKey) throw new Error('SEMAPHORE_API_KEY is not configured.');
  const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const recipients=Array.isArray(b.recipients)?b.recipients:[];
  const message=String(b.message||'').trim();
  if(!recipients.length||!message) return res.status(400).json({error:'Recipients and message are required.'});
  const results=[];
  for(const raw of recipients){
    const number=String(raw||'').replace(/\s+/g,'');
    if(!/^09\d{9}$/.test(number)){results.push({number,ok:false,error:'Invalid number'});continue;}
    const form=new URLSearchParams({apikey:apiKey,number,message});
    if(process.env.SEMAPHORE_SENDER_NAME) form.set('sendername',process.env.SEMAPHORE_SENDER_NAME);
    const r=await fetch('https://api.semaphore.co/api/v4/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
    const txt=await r.text();
    results.push({number,ok:r.ok,response:txt});
  }
  return res.status(200).json({ok:true,results});
 }catch(e){return res.status(e.statusCode||500).json({error:e.message||'Server error'});}
};
