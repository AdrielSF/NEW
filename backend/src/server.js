import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import XLSX from 'xlsx';
import { randomUUID } from 'node:crypto';
import { query, tx } from './db.js';
import { login, logout, requireAuth, requireRole } from './auth.js';
import { isValidDeadline, maxDeadline, isLate } from './businessDays.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('combined'));
app.use(cors({ origin: true, credentials: true }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const STATUSES = ['Em andamento','Pausado/CS','Pausado/Desenv','Concluído','Cancelado'];
const PAUSE_REASONS = ['Aguardando cliente','Aguardando CS','Aguardando desenvolvimento','Problema técnico','Aguardando informação','Aguardando treinamento','Outros'];

function audit(req, client, { action, entity, entityId, field='', oldValue=null, newValue=null }) {
  return client.query(
    `INSERT INTO audit_logs(id,user_id,action,entity,entity_id,field,old_value,new_value,ip_address)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), req.user?.id ?? null, action, entity, entityId ?? null, field, oldValue, newValue, req.ip]
  );
}

app.post('/api/auth/login', loginLimiter, login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', requireAuth, (req,res) => res.json({ user: req.user }));

app.get('/api/meta', requireAuth, async (req,res,next) => {
  try {
    const [r,c] = await Promise.all([
      query(`SELECT id,name,active FROM responsaveis ORDER BY name`),
      query(`SELECT id,code,name,active FROM clients ORDER BY code`)
    ]);
    res.json({ statuses: STATUSES, pauseReasons: PAUSE_REASONS, responsaveis:r.rows, clients:c.rows });
  } catch(e){ next(e); }
});

app.get('/api/users', requireAuth, requireRole('admin'), async (req,res,next)=>{
  try {
    const {rows}=await query(`SELECT id,name,username,email,role,active,created_at,last_login_at FROM users ORDER BY name`);
    res.json(rows);
  } catch(e){next(e);}
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req,res,next)=>{
  try {
    const {name,username,email,password,role='viewer',active=true}=req.body;
    if(!name||!username||!password||!['admin','manager','implementer','viewer'].includes(role))
      return res.status(400).json({error:'Dados de usuário inválidos.'});
    const argon2 = (await import('argon2')).default;
    const hash=await argon2.hash(String(password),{type:argon2.argon2id});
    const id=randomUUID();
    await tx(async c=>{
      await c.query(`INSERT INTO users(id,name,username,email,password_hash,role,active) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id,name.trim(),username.trim(),email?.trim()||null,hash,role,Boolean(active)]);
      await audit(req,c,{action:'CREATE',entity:'user',entityId:id,newValue:name.trim()});
    });
    res.status(201).json({id});
  }catch(e){next(e);}
});

app.patch('/api/users/:id/status', requireAuth, requireRole('admin'), async (req,res,next)=>{
  try{
    const active=Boolean(req.body.active);
    if(req.params.id===req.user.id && !active) return res.status(400).json({error:'Você não pode bloquear a própria conta.'});
    await tx(async c=>{
      const old=await c.query(`SELECT active FROM users WHERE id=$1`,[req.params.id]);
      if(!old.rows[0]) throw Object.assign(new Error('Usuário não encontrado'),{status:404});
      await c.query(`UPDATE users SET active=$1,updated_at=now() WHERE id=$2`,[active,req.params.id]);
      await audit(req,c,{action:'UPDATE',entity:'user',entityId:req.params.id,field:'active',oldValue:String(old.rows[0].active),newValue:String(active)});
    });
    res.json({ok:true});
  }catch(e){next(e);}
});

app.get('/api/responsaveis', requireAuth, async(req,res,next)=>{
  try{res.json((await query(`SELECT * FROM responsaveis ORDER BY name`)).rows);}catch(e){next(e);}
});
app.post('/api/responsaveis', requireAuth, requireRole('admin','manager'), async(req,res,next)=>{
  try{
    const id=randomUUID(), name=String(req.body.name||'').trim().replace(/\s+/g,' ');
    if(!name) return res.status(400).json({error:'Nome obrigatório.'});
    await query(`INSERT INTO responsaveis(id,name) VALUES($1,$2)`,[id,name]);
    res.status(201).json({id,name});
  }catch(e){next(e);}
});

app.get('/api/clients', requireAuth, async(req,res,next)=>{
  try{res.json((await query(`SELECT * FROM clients ORDER BY code`)).rows);}catch(e){next(e);}
});
app.post('/api/clients', requireAuth, requireRole('admin','manager','implementer'), async(req,res,next)=>{
  try{
    const id=randomUUID(), code=String(req.body.code||'').trim(), name=String(req.body.name||'').trim();
    if(!code) return res.status(400).json({error:'Código do cliente obrigatório.'});
    await query(`INSERT INTO clients(id,code,name) VALUES($1,$2,$3)`,[id,code,name||null]);
    res.status(201).json({id,code,name});
  }catch(e){next(e);}
});

function normalizePayload(body){
  return {
    clientCode:String(body.clientCode??'').trim(),
    responsibleId:body.responsibleId||null,
    systemName:String(body.systemName??'').trim(),
    functionName:String(body.functionName??'').trim(),
    status:STATUSES.includes(body.status)?body.status:'Em andamento',
    pauseReason:PAUSE_REASONS.includes(body.pauseReason)?body.pauseReason:'',
    startDate:String(body.startDate??''),
    deadline:String(body.deadline??''),
    completionDate:body.completionDate?String(body.completionDate):null,
    details:String(body.details??'')
  };
}

async function getClientByCode(client, code){
  const found=await client.query(`SELECT id FROM clients WHERE code=$1`,[code]);
  if(found.rows[0]) return found.rows[0].id;
  const id=randomUUID();
  await client.query(`INSERT INTO clients(id,code) VALUES($1,$2)`,[id,code]);
  return id;
}

app.get('/api/implementations', requireAuth, async(req,res,next)=>{
  try{
    const {status,responsible,search,late}=req.query;
    const params=[]; const where=[];
    if(status){params.push(status);where.push(`i.status=$${params.length}`);}
    if(responsible){params.push(responsible);where.push(`i.responsible_id=$${params.length}`);}
    if(search){params.push(`%${String(search).toLowerCase()}%`);where.push(`(lower(c.code) LIKE $${params.length} OR lower(coalesce(c.name,'')) LIKE $${params.length} OR lower(i.system_name) LIKE $${params.length})`);}
    if(late==='true') where.push(`i.status NOT IN ('Concluído','Cancelado') AND i.deadline < CURRENT_DATE`);
    const sql=`SELECT i.*,c.code AS client_code,c.name AS client_name,r.name AS responsible_name
      FROM implementations i JOIN clients c ON c.id=i.client_id
      LEFT JOIN responsaveis r ON r.id=i.responsible_id
      ${where.length?'WHERE '+where.join(' AND '):''}
      ORDER BY i.deadline ASC,i.created_at DESC`;
    const {rows}=await query(sql,params);
    res.json(rows);
  }catch(e){next(e);}
});

app.post('/api/implementations', requireAuth, requireRole('admin','manager','implementer'), async(req,res,next)=>{
  try{
    const p=normalizePayload(req.body);
    if(!p.clientCode||!p.startDate||!p.deadline) return res.status(400).json({error:'Cliente, início e prazo são obrigatórios.'});
    if(!isValidDeadline(p.startDate,p.deadline)) return res.status(400).json({error:`Prazo inválido. O máximo é ${maxDeadline(p.startDate)} (15 dias úteis).`});
    if(p.status==='Concluído'&&!p.completionDate) return res.status(400).json({error:'Conclusão é obrigatória para status Concluído.'});
    const id=randomUUID();
    await tx(async c=>{
      const clientId=await getClientByCode(c,p.clientCode);
      await c.query(`INSERT INTO implementations(id,client_id,responsible_id,system_name,function_name,status,pause_reason,start_date,deadline,completion_date,details,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [id,clientId,p.responsibleId,p.systemName,p.functionName,p.status,p.pauseReason,p.startDate,p.deadline,p.completionDate,p.details,req.user.id]);
      await audit(req,c,{action:'CREATE',entity:'implementation',entityId:id,newValue:JSON.stringify(p)});
    });
    res.status(201).json({id});
  }catch(e){next(e);}
});

app.get('/api/implementations/:id', requireAuth, async(req,res,next)=>{
  try{
    const i=(await query(`SELECT i.*,c.code client_code,c.name client_name,r.name responsible_name
      FROM implementations i JOIN clients c ON c.id=i.client_id LEFT JOIN responsaveis r ON r.id=i.responsible_id WHERE i.id=$1`,[req.params.id])).rows[0];
    if(!i) return res.status(404).json({error:'Implantação não encontrada.'});
    const [check,comments,hist]=await Promise.all([
      query(`SELECT * FROM checklist_items WHERE implementation_id=$1 ORDER BY position`,[req.params.id]),
      query(`SELECT cm.*,u.name user_name FROM comments cm JOIN users u ON u.id=cm.user_id WHERE implementation_id=$1 ORDER BY cm.created_at`,[req.params.id]),
      query(`SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE entity='implementation' AND entity_id=$1 ORDER BY a.created_at DESC`,[req.params.id])
    ]);
    res.json({...i,late:isLate(i.status,i.deadline),checklist:check.rows,comments:comments.rows,history:hist.rows});
  }catch(e){next(e);}
});

app.put('/api/implementations/:id', requireAuth, requireRole('admin','manager','implementer'), async(req,res,next)=>{
  try{
    const p=normalizePayload(req.body);
    if(!isValidDeadline(p.startDate,p.deadline)) return res.status(400).json({error:`Prazo inválido. O máximo é ${maxDeadline(p.startDate)}.`});
    await tx(async c=>{
      const old=await c.query(`SELECT * FROM implementations WHERE id=$1`,[req.params.id]);
      if(!old.rows[0]) throw Object.assign(new Error('Implantação não encontrada'),{status:404});
      const oldRow=old.rows[0];
      const clientId=await getClientByCode(c,p.clientCode);
      await c.query(`UPDATE implementations SET client_id=$1,responsible_id=$2,system_name=$3,function_name=$4,status=$5,pause_reason=$6,start_date=$7,deadline=$8,completion_date=$9,details=$10,updated_by=$11,updated_at=now() WHERE id=$12`,
        [clientId,p.responsibleId,p.systemName,p.functionName,p.status,p.pauseReason,p.startDate,p.deadline,p.completionDate,p.details,req.user.id,req.params.id]);
      const pairs=[['status',oldRow.status,p.status],['deadline',oldRow.deadline,p.deadline],['responsible_id',oldRow.responsible_id,p.responsibleId],['details',oldRow.details,p.details]];
      for(const [field,ov,nv] of pairs) if(String(ov??'')!==String(nv??'')) await audit(req,c,{action:'UPDATE',entity:'implementation',entityId:req.params.id,field,oldValue:String(ov??''),newValue:String(nv??'')});
    });
    res.json({ok:true});
  }catch(e){next(e);}
});

app.delete('/api/implementations/:id', requireAuth, requireRole('admin','manager'), async(req,res,next)=>{
  try{
    await tx(async c=>{
      const old=await c.query(`SELECT * FROM implementations WHERE id=$1`,[req.params.id]);
      if(!old.rows[0]) throw Object.assign(new Error('Implantação não encontrada'),{status:404});
      await audit(req,c,{action:'DELETE',entity:'implementation',entityId:req.params.id,oldValue:JSON.stringify(old.rows[0])});
      await c.query(`DELETE FROM implementations WHERE id=$1`,[req.params.id]);
    });
    res.json({ok:true});
  }catch(e){next(e);}
});

app.patch('/api/implementations/:id/checklist/:itemId', requireAuth, requireRole('admin','manager','implementer'), async(req,res,next)=>{
  try{
    const completed=Boolean(req.body.completed);
    await query(`UPDATE checklist_items SET completed=$1,completed_by=$2,completed_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$3 AND implementation_id=$4`,
      [completed,completed?req.user.id:null,req.params.itemId,req.params.id]);
    res.json({ok:true});
  }catch(e){next(e);}
});

app.post('/api/implementations/:id/checklist', requireAuth, requireRole('admin','manager','implementer'), async(req,res,next)=>{
  try{
    const id=randomUUID();
    await query(`INSERT INTO checklist_items(id,implementation_id,item,position) VALUES($1,$2,$3,$4)`,
      [id,req.params.id,String(req.body.item||'').trim(),Number(req.body.position||0)]);
    res.status(201).json({id});
  }catch(e){next(e);}
});

app.post('/api/implementations/:id/comments', requireAuth, async(req,res,next)=>{
  try{
    const text=String(req.body.text||'').trim();
    if(!text) return res.status(400).json({error:'Comentário vazio.'});
    const id=randomUUID();
    await tx(async c=>{
      await c.query(`INSERT INTO comments(id,implementation_id,user_id,text) VALUES($1,$2,$3,$4)`,[id,req.params.id,req.user.id,text]);
      await audit(req,c,{action:'CREATE',entity:'comment',entityId:id,newValue:text});
    });
    res.status(201).json({id});
  }catch(e){next(e);}
});

app.get('/api/history', requireAuth, async(req,res,next)=>{
  try{
    const limit=Math.min(Number(req.query.limit||200),1000);
    const {rows}=await query(`SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT $1`,[limit]);
    res.json(rows);
  }catch(e){next(e);}
});

app.get('/api/dashboard', requireAuth, async(req,res,next)=>{
  try{
    const {rows}=await query(`SELECT
      COUNT(*)::int total,
      COUNT(*) FILTER (WHERE status='Em andamento')::int andamento,
      COUNT(*) FILTER (WHERE status LIKE 'Pausado/%')::int pausadas,
      COUNT(*) FILTER (WHERE status='Concluído')::int concluidas,
      COUNT(*) FILTER (WHERE status='Cancelado')::int canceladas,
      COUNT(*) FILTER (WHERE status NOT IN ('Concluído','Cancelado') AND deadline<CURRENT_DATE)::int atrasadas
      FROM implementations`);
    const [byResp,bottlenecks]=await Promise.all([
      query(`SELECT COALESCE(r.name,'Sem responsável') name,COUNT(*)::int total FROM implementations i LEFT JOIN responsaveis r ON r.id=i.responsible_id GROUP BY r.name ORDER BY total DESC`),
      query(`SELECT COALESCE(NULLIF(pause_reason,''),'Sem motivo') name,COUNT(*)::int total FROM implementations WHERE status LIKE 'Pausado/%' GROUP BY pause_reason ORDER BY total DESC`)
    ]);
    res.json({metrics:rows[0],byResponsible:byResp.rows,bottlenecks:bottlenecks.rows});
  }catch(e){next(e);}
});

app.get('/api/export/xlsx', requireAuth, async(req,res,next)=>{
  try{
    const {rows}=await query(`SELECT c.code "ID Cliente",i.details "Detalhes",i.function_name "Função",
      r.name "Responsável",i.system_name "Sistema",i.start_date "Data de Início",i.deadline "Prazo",
      i.completion_date "Data de Conclusão",i.status "Status",i.pause_reason "Motivo da Pausa"
      FROM implementations i JOIN clients c ON c.id=i.client_id LEFT JOIN responsaveis r ON r.id=i.responsible_id ORDER BY i.deadline`);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Base');
    const out=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="implantapro-export.xlsx"');
    res.send(out);
  }catch(e){next(e);}
});

app.post('/api/import/xlsx', requireAuth, requireRole('admin','manager'), upload.single('file'), async(req,res,next)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Arquivo XLSX obrigatório.'});
    const wb=XLSX.read(req.file.buffer,{type:'buffer',cellDates:false});
    const sheet=wb.Sheets[wb.SheetNames.includes('Base')?'Base':wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
    const result={total:rows.length,created:0,errors:[]};
    for(let idx=0;idx<rows.length;idx++){
      const r=rows[idx];
      try{
        const start=String(r['Data de Início']||'').slice(0,10);
        const deadline=String(r['Prazo']||'').slice(0,10);
        if(!r['ID Cliente']||!start||!deadline||!isValidDeadline(start,deadline)) throw new Error('Cliente, início/prazo inválidos ou prazo > 15 dias úteis.');
        await tx(async c=>{
          const clientId=await getClientByCode(c,String(r['ID Cliente']).trim());
          const respName=String(r['Responsável']||'').trim();
          let respId=null;
          if(respName){
            const rr=await c.query(`SELECT id FROM responsaveis WHERE lower(name)=lower($1)`,[respName]);
            respId=rr.rows[0]?.id||null;
          }
          const id=randomUUID();
          await c.query(`INSERT INTO implementations(id,client_id,responsible_id,system_name,function_name,status,pause_reason,start_date,deadline,completion_date,details,created_by,updated_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
            [id,clientId,respId,String(r['Sistema']||''),String(r['Função']||''),STATUSES.includes(r['Status'])?r['Status']:'Em andamento',
             PAUSE_REASONS.includes(r['Motivo da Pausa'])?r['Motivo da Pausa']:'',start,deadline,r['Data de Conclusão']||null,String(r['Detalhes']||''),req.user.id]);
          await audit(req,c,{action:'IMPORT',entity:'implementation',entityId:id,newValue:`linha ${idx+2}`});
        });
        result.created++;
      }catch(e){result.errors.push({line:idx+2,error:e.message});}
    }
    res.json(result);
  }catch(e){next(e);}
});

const frontendDir=path.resolve(__dirname,'../../frontend');
app.use(express.static(frontendDir));
app.get('*',(req,res,next)=>{
  if(req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDir,'index.html'));
});

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err.status||500).json({error:err.message||'Erro interno do servidor.'});
});

const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`ImplantaPro V2: http://localhost:${port}`));
