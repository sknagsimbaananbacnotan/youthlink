export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const auth=String(req.headers.authorization||'');
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token) return res.status(401).json({error:'Authentication required'});

    const supabaseUrl=process.env.SUPABASE_URL;
    const pub=process.env.SUPABASE_PUBLISHABLE_KEY;
    if(!supabaseUrl||!pub) return res.status(500).json({error:'Supabase server configuration missing'});

    const userResp=await fetch(`${supabaseUrl}/auth/v1/user`,{
      headers:{apikey:pub,Authorization:`Bearer ${token}`}
    });
    if(!userResp.ok) return res.status(401).json({error:'Invalid or expired YouthLink session'});
    const user=await userResp.json();

    const staffResp=await fetch(`${supabaseUrl}/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role,active`,{
      headers:{apikey:pub,Authorization:`Bearer ${token}`,Accept:'application/json'}
    });
    if(!staffResp.ok) return res.status(403).json({error:'Could not verify staff authorization'});
    const staff=await staffResp.json();
    if(!staff?.[0]?.active || !['admin','encoder'].includes(staff[0].role))
      return res.status(403).json({error:'Your account is not allowed to send SMS'});

    const {recipients,message}=req.body||{};
    if(!Array.isArray(recipients)||!recipients.length||!String(message||'').trim())
      return res.status(400).json({error:'Recipients and message required'});
    if(recipients.length>500) return res.status(400).json({error:'Maximum 500 recipients per request'});

    const key=process.env.SEMAPHORE_API_KEY, sender=process.env.SEMAPHORE_SENDER_NAME;
    if(!key) return res.status(500).json({error:'Semaphore API key missing'});

    let sent=0, failed=0;
    for(const x of recipients){
      const number=String(x.mobile||'').replace(/\D/g,'');
      if(!number){failed++;continue}
      const body=new URLSearchParams({apikey:key,number,message:String(message).slice(0,1000)});
      if(sender) body.set('sendername',sender);
      const r=await fetch('https://api.semaphore.co/api/v4/messages',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body
      });
      if(r.ok) sent++; else failed++;
    }
    return res.status(sent?200:502).json({sent,failed,total:recipients.length});
  }catch(e){return res.status(500).json({error:e.message||'SMS failed'});}
}