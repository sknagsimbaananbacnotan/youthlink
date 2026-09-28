const {cors,auth,sb}=require('./_lib');
module.exports=async(req,res)=>{cors(res);if(req.method==='OPTIONS')return res.status(204).end();try{
 if(req.method==='GET'){
   const admin=req.query&&req.query.admin==='1';
   if(admin&&!auth(req))return res.status(401).json({error:'Unauthorized'});
   const filter=admin?'':'&active=eq.true';
   const rows=await sb('wifi_announcements?select=id,display_date,title,body,active,sort_order,created_at&order=sort_order.asc,created_at.desc'+filter);
   return res.json({announcements:rows||[]});
 }
 if(!auth(req))return res.status(401).json({error:'Unauthorized'});
 if(req.method==='POST'){const b=req.body||{};const rows=await sb('wifi_announcements',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({display_date:b.display_date||'',title:b.title||'',body:b.body||'',active:b.active!==false,sort_order:0})});return res.json({ok:true,announcement:rows&&rows[0]})}
 if(req.method==='PUT'){const b=req.body||{};if(!b.id)return res.status(400).json({error:'Missing id'});const rows=await sb('wifi_announcements?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({display_date:b.display_date||'',title:b.title||'',body:b.body||'',active:b.active!==false})});return res.json({ok:true,announcement:rows&&rows[0]})}
 if(req.method==='DELETE'){const id=req.query&&req.query.id;if(!id)return res.status(400).json({error:'Missing id'});await sb('wifi_announcements?id=eq.'+encodeURIComponent(id),{method:'DELETE'});return res.json({ok:true})}
 return res.status(405).json({error:'Method not allowed'});
}catch(e){return res.status(500).json({error:e.message})}};