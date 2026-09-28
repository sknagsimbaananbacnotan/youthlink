const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const clean = v => String(v || '').trim().replace(/\s+/g, ' ');
const fullName = p => [p.first_name,p.middle_name,p.last_name,p.suffix].map(clean).filter(Boolean).join(' ').toUpperCase();

async function sendConfirmationSMS(p, referenceNo, isExisting){
  const apiKey=process.env.SEMAPHORE_API_KEY;
  if(!apiKey || !p.contact_number) return {sent:false,reason:'SMS not configured'};
  const name=fullName(p);
  const message=isExisting
    ? `YOUTHLINK: Magandang araw, KK ${name}! Natanggap na namin ang update sa iyong KK Profiling Information.\nReference No.: ${referenceNo}\nIbe-verify muna ang iyong impormasyon bago ma-update ang official record. Maraming salamat sa iyong pakikiisa!\n\n-Sangguniang Kabataan ng Nagsimbaanan, Bacnotan, La Union\nThis is an automated message.`
    : `YOUTHLINK: Magandang araw, KK ${name}! Natanggap na namin ang iyong KK Profiling Information.\nReference No.: ${referenceNo}\nAng iyong impormasyon ay subject to verification by SK Nagsimbaanan. Maraming salamat sa iyong pakikiisa!\n\n-Sangguniang Kabataan ng Nagsimbaanan, Bacnotan, La Union\nThis is an automated message.`;
  const body=new URLSearchParams({apikey:apiKey,number:p.contact_number,message});
  if(process.env.SEMAPHORE_SENDER_NAME) body.set('sendername',process.env.SEMAPHORE_SENDER_NAME);
  try{
    const r=await fetch('https://api.semaphore.co/api/v4/messages',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const text=await r.text();
    if(!r.ok){console.error('Profiling confirmation SMS failed:',r.status,text);return {sent:false};}
    return {sent:true};
  }catch(e){console.error('Profiling confirmation SMS error:',e);return {sent:false};}
}

module.exports=async(req,res)=>{
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
 try{
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Server database configuration is incomplete');
  const sb=createClient(url,key,{auth:{persistSession:false}}); const p=req.body||{};
  for(const f of ['first_name','last_name','birth_date','sector','contact_number','home_address']) if(!clean(p[f])) return res.status(400).json({error:'Please complete all required fields.'});
  if(!/^09\d{9}$/.test(clean(p.contact_number))) return res.status(400).json({error:'Enter a valid 11-digit Philippine mobile number.'});
  const q=await sb.from('kk_members').select('id,youthlink_id,first_name,middle_name,last_name,suffix,birth_date').ilike('first_name',clean(p.first_name)).ilike('last_name',clean(p.last_name)).eq('birth_date',p.birth_date).limit(2);
  if(q.error) throw q.error;
  const match=(q.data||[])[0]||null;
  const ref='KKP-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
  const row={reference_no:ref,matched_member_id:match?.id||null,first_name:clean(p.first_name),middle_name:clean(p.middle_name),last_name:clean(p.last_name),suffix:clean(p.suffix),date_of_birth:p.birth_date,sector:String(p.sector),sex:p.sex_assigned_at_birth||'',civil_status:p.civil_status||'',youth_classification:p.youth_classification||'',youth_specific_needs:p.specific_needs_indicator||'',email:clean(p.email),contact_number:clean(p.contact_number),region:'Region I',province:'La Union',municipality:'Bacnotan',barangay:'Nagsimbaanan',home_address:clean(p.home_address),educational_attainment:p.educational_attainment||'',work_status:p.work_status||'',registered_sk_voter:p.registered_sk_voter||'',registered_national_voter:p.registered_national_voter||'',voted_last_sk_election:p.voted_last_sk_election||'',attended_kk_assembly:p.attended_kk_assembly||'',kk_assembly_times:p.kk_assembly_times||'',kk_assembly_no_reason:p.kk_assembly_no_reason||'',submission_type:match?'UPDATE':'NEW',status:'PENDING',privacy_consent:true};
  const ins=await sb.from('kk_profile_submissions').insert(row); if(ins.error) throw ins.error;
  const sms=await sendConfirmationSMS(p,ref,!!match);
  return res.status(200).json({ok:true,referenceNo:ref,matchType:match?'existing':'new',smsSent:sms.sent});
 }catch(e){console.error(e);return res.status(500).json({error:e.message||'Server error'});}
};
