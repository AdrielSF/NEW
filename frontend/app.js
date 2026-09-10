const $=id=>document.getElementById(id);
let currentUser=null, meta={statuses:[],pauseReasons:[],responsaveis:[],clients:[]}, editing=null;

async function api(url,opts={}){
  const res=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  if(!res.ok){let e={};try{e=await res.json()}catch{};throw new Error(e.error||`HTTP ${res.status}`)}
  return res.status===204?null:res.json();
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function date(v){return v?new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('pt-BR'):''}
function roleName(r){return {admin:'Administrador',manager:'Gerente',implementer:'Implantador',viewer:'Consulta'}[r]||r}
function can(...roles){return roles.includes(currentUser?.role)}
function toast(msg){alert(msg)}

async function boot(){
  try{
    const me=await api('/api/auth/me');
    currentUser=me.user;
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    $('userBadge').textContent=`${currentUser.name} • ${roleName(currentUser.role)}`;
    document.querySelectorAll('.admin-only').forEach(x=>x.style.display=can('admin')?'block':'none');
    document.querySelectorAll('.admin-manager').forEach(x=>x.style.display=can('admin','manager')?'inline-block':'none');
    $('newBtn').style.display=can('admin','manager','implementer')?'inline-block':'none';
    await loadMeta(); await loadDashboard(); await loadImplementations();
  }catch{ $('login').classList.remove('hidden'); $('app').classList.add('hidden'); }
}
async function loadMeta(){
  meta=await api('/api/meta');
  $('statusFilter').innerHTML='<option value="">Todos os status</option>'+meta.statuses.map(x=>`<option>${esc(x)}</option>`).join('');
  $('status').innerHTML=meta.statuses.map(x=>`<option>${esc(x)}</option>`).join('');
  $('pauseReason').innerHTML='<option value="">Sem motivo</option>'+meta.pauseReasons.map(x=>`<option>${esc(x)}</option>`).join('');
  const opts='<option value="">Sem responsável</option>'+meta.responsaveis.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('responsibleId').innerHTML=opts; $('responsibleFilter').innerHTML=opts;
}
async function loadDashboard(){
  const d=await api('/api/dashboard'), m=d.metrics;
  $('kpis').innerHTML=[
    ['Total',m.total],['Em andamento',m.andamento],['Pausadas',m.pausadas],
    ['Concluídas',m.concluidas],['Canceladas',m.canceladas],['Atrasadas',m.atrasadas]
  ].map(([a,b])=>`<div class="kpi"><span>${a}</span><strong>${b}</strong></div>`).join('');
  $('byResponsible').innerHTML=d.byResponsible.map(x=>`<div class="bar"><span>${esc(x.name)}</span><strong>${x.total}</strong></div>`).join('')||'<p class="muted">Sem dados.</p>';
  $('bottlenecks').innerHTML=d.bottlenecks.map(x=>`<div class="bar"><span>${esc(x.name)}</span><strong>${x.total}</strong></div>`).join('')||'<p class="muted">Sem dados.</p>';
}
async function loadImplementations(){
  const p=new URLSearchParams();
  if($('statusFilter').value)p.set('status',$('statusFilter').value);
  if($('responsibleFilter').value)p.set('responsible',$('responsibleFilter').value);
  if($('search').value)p.set('search',$('search').value);
  if($('lateFilter').checked)p.set('late','true');
  const rows=await api('/api/implementations?'+p);
  $('tableBody').innerHTML=rows.map(r=>{
    const late=r.status!=='Concluído'&&r.status!=='Cancelado'&&new Date(r.deadline)<new Date(new Date().toISOString().slice(0,10));
    return `<tr><td>${esc(r.client_code)}</td><td>${esc(r.system_name)}</td><td>${esc(r.responsible_name||'—')}</td><td>${date(r.start_date)}</td><td>${date(r.deadline)}</td><td><span class="status ${late?'late':'ok'}">${esc(r.status)}${late?' • ATRASADA':''}</span></td><td><button class="secondary" onclick="openImpl('${r.id}')">Abrir</button></td></tr>`;
  }).join('')||'<tr><td colspan="7">Nenhuma implantação encontrada.</td></tr>';
}
async function openImpl(id){
  editing=await api('/api/implementations/'+id);
  $('modalTitle').textContent='Editar implantação';
  $('implId').value=editing.id;$('clientCode').value=editing.client_code;$('responsibleId').value=editing.responsible_id||'';
  $('systemName').value=editing.system_name;$('functionName').value=editing.function_name;$('status').value=editing.status;
  $('pauseReason').value=editing.pause_reason||'';$('startDate').value=String(editing.start_date).slice(0,10);
  $('deadline').value=String(editing.deadline).slice(0,10);$('completionDate').value=editing.completion_date?String(editing.completion_date).slice(0,10):'';
  $('details').value=editing.details||'';$('deleteBtn').style.display=can('admin','manager')?'inline-block':'none';
  renderExtra();$('modal').classList.remove('hidden');
}
function newImpl(){
  editing=null;$('modalTitle').textContent='Nova implantação';$('implId').value='';
  ['clientCode','systemName','functionName','details','completionDate'].forEach(id=>$(id).value='');
  $('responsibleId').value='';$('status').value='Em andamento';$('pauseReason').value='';
  const now=new Date();const iso=now.toISOString().slice(0,10);$('startDate').value=iso;$('deadline').value=iso;
  $('deleteBtn').style.display='none';$('detailExtra').innerHTML='';$('modal').classList.remove('hidden');
}
function renderExtra(){
  if(!editing)return;
  $('detailExtra').innerHTML=`
    <div class="card"><h4>Checklist</h4><div class="checklist">${editing.checklist.map(c=>`<label class="check"><input type="checkbox" ${c.completed?'checked':''} onchange="toggleCheck('${editing.id}','${c.id}',this.checked)"> ${esc(c.item)}</label>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><input id="newCheck" placeholder="Novo item de checklist"><button type="button" onclick="addCheck()">Adicionar</button></div></div>
    <div class="card"><h4>Comentários</h4>${editing.comments.map(c=>`<div class="comment"><b>${esc(c.user_name)}</b> <small>${new Date(c.created_at).toLocaleString('pt-BR')}</small><br>${esc(c.text)}</div>`).join('')||'<p class="muted">Nenhum comentário.</p>'}
    <div style="display:flex;gap:8px;margin-top:10px"><input id="newComment" placeholder="Novo comentário"><button type="button" onclick="addComment()">Comentar</button></div></div>
  `;
}
async function toggleCheck(i,c,v){try{await api(`/api/implementations/${i}/checklist/${c}`,{method:'PATCH',body:JSON.stringify({completed:v})});editing=await api('/api/implementations/'+i);renderExtra()}catch(e){toast(e.message)}}
async function addCheck(){const v=$('newCheck').value.trim();if(!v)return;try{await api(`/api/implementations/${editing.id}/checklist`,{method:'POST',body:JSON.stringify({item:v,position:editing.checklist.length})});editing=await api('/api/implementations/'+editing.id);renderExtra()}catch(e){toast(e.message)}}
async function addComment(){const v=$('newComment').value.trim();if(!v)return;try{await api(`/api/implementations/${editing.id}/comments`,{method:'POST',body:JSON.stringify({text:v})});editing=await api('/api/implementations/'+editing.id);renderExtra()}catch(e){toast(e.message)}}
async function saveImpl(e){
  e.preventDefault();
  const body={clientCode:$('clientCode').value,responsibleId:$('responsibleId').value||null,systemName:$('systemName').value,functionName:$('functionName').value,status:$('status').value,pauseReason:$('pauseReason').value,startDate:$('startDate').value,deadline:$('deadline').value,completionDate:$('completionDate').value||null,details:$('details').value};
  try{
    if(editing) await api('/api/implementations/'+editing.id,{method:'PUT',body:JSON.stringify(body)});
    else await api('/api/implementations',{method:'POST',body:JSON.stringify(body)});
    closeModal();await Promise.all([loadDashboard(),loadImplementations(),loadMeta()]);
  }catch(e){toast(e.message)}
}
async function deleteImpl(){if(!editing||!confirm('Excluir esta implantação?'))return;try{await api('/api/implementations/'+editing.id,{method:'DELETE'});closeModal();await Promise.all([loadDashboard(),loadImplementations()])}catch(e){toast(e.message)}}
async function loadHistory(){const rows=await api('/api/history');$('historyBody').innerHTML=rows.map(r=>`<tr><td>${new Date(r.created_at).toLocaleString('pt-BR')}</td><td>${esc(r.user_name||'Sistema')}</td><td>${esc(r.action)}</td><td>${esc(r.entity)}</td><td>${esc(r.field||'')}</td><td>${esc(r.new_value||'')}</td></tr>`).join('')}
async function loadAdmin(){
  if(!can('admin'))return;
  const [users,resps]=await Promise.all([api('/api/users'),api('/api/responsaveis')]);
  $('usersList').innerHTML=users.map(u=>`<div class="user-row"><span>${esc(u.name)} • ${roleName(u.role)} ${u.active?'':'(bloqueado)'}</span><button onclick="toggleUser('${u.id}',${!u.active})">${u.active?'Bloquear':'Ativar'}</button></div>`).join('');
  $('responsiblesList').innerHTML=resps.map(r=>`<div class="user-row"><span>${esc(r.name)}</span><span>${r.active?'Ativo':'Inativo'}</span></div>`).join('');
}
async function toggleUser(id,active){try{await api('/api/users/'+id+'/status',{method:'PATCH',body:JSON.stringify({active})});loadAdmin()}catch(e){toast(e.message)}}
async function exportXlsx(){const res=await fetch('/api/export/xlsx',{credentials:'include'});if(!res.ok){toast('Não foi possível exportar.');return}const blob=await res.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='implantapro-export.xlsx';a.click();URL.revokeObjectURL(a.href)}
async function importXlsx(file){const fd=new FormData();fd.append('file',file);const res=await fetch('/api/import/xlsx',{method:'POST',body:fd,credentials:'include'});const data=await res.json();if(!res.ok)throw new Error(data.error);toast(`Importação: ${data.created}/${data.total} registros. ${data.errors.length} erro(s).`);await Promise.all([loadDashboard(),loadImplementations()])}
function closeModal(){$('modal').classList.add('hidden');editing=null}
function showPage(name){
  document.querySelectorAll('.page').forEach(x=>x.classList.add('hidden'));$(name).classList.remove('hidden');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===name));
  $('pageTitle').textContent={dashboard:'Dashboard',implementations:'Implantações',history:'Histórico',admin:'Administração'}[name];
  if(name==='dashboard')loadDashboard();if(name==='implementations')loadImplementations();if(name==='history')loadHistory();if(name==='admin')loadAdmin();
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{const r=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username:$('username').value,password:$('password').value})});currentUser=r.user;await boot()}catch(e){$('loginError').textContent=e.message}});
$('logout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.reload()};
$('newBtn').onclick=newImpl;$('closeModal').onclick=closeModal;$('cancelBtn').onclick=closeModal;$('deleteBtn').onclick=deleteImpl;$('implementationForm').addEventListener('submit',saveImpl);
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
['search','statusFilter','responsibleFilter','lateFilter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',loadImplementations));
$('exportBtn').onclick=exportXlsx;$('importFile').onchange=e=>e.target.files[0]&&importXlsx(e.target.files[0]);
$('userForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/users',{method:'POST',body:JSON.stringify({name:$('uName').value,username:$('uUsername').value,email:$('uEmail').value,password:$('uPassword').value,role:$('uRole').value})});e.target.reset();loadAdmin()}catch(x){toast(x.message)}});
$('responsibleForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/responsaveis',{method:'POST',body:JSON.stringify({name:$('rName').value})});e.target.reset();await loadMeta();loadAdmin()}catch(x){toast(x.message)}});
boot();
