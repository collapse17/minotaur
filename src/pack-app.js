import './style.css';
import {loadPacks} from './packs.js';
import {fieldErrors} from './config.js';
import {openPackEditor} from './pack-editor.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function start(){
  let config=await loadPacks();let path=[],pack=null,index=0,inputs={},logs=[],busy=false;
  const app=document.querySelector('#app');
  const nodes=()=>path.reduce((n,i)=>n[i].children,config.navigation);
  function render(){
    const step=pack?.wizard[index];
    app.innerHTML=`<header><strong>MINOTAUR</strong><button id="home" ${busy?'disabled':''}>Главная</button></header><main><h1>${esc(pack?.name||'Выберите задачу')}</h1>${pack?`<p>${esc(pack.path.join(' → '))}</p><ol class="wizard-progress">${pack.wizard.map((w,i)=>`<li class="${i===index?'current':''}">${esc(w.label||w.title)}</li>`).join('')}</ol><section class="panel"><h2>${esc(step.title)}</h2><p>${esc(step.description)}</p>${step.type==='form'?step.fields.map(f=>`<label>${esc(f.label)}${f.type==='select'?`<select data-field="${esc(f.id)}">${f.options.map(o=>`<option value="${esc(o.value)}" ${inputs[f.id]===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea data-field="${esc(f.id)}">${esc(inputs[f.id])}</textarea>`:`<input data-field="${esc(f.id)}" type="${esc(f.type)}" ${f.type==='checkbox'?(inputs[f.id]?'checked':''):`value="${esc(inputs[f.id])}"`}>`}</label>`).join(''):step.type==='review'?pack.steps.filter(s=>s.enabled).map(s=>`<p>${esc(config.templates.find(t=>t.id===s.template)?.name)}</p>`).join(''):''}<pre>${esc(logs.join('\n'))}</pre><p id="error" role="alert"></p><div class="actions">${index>0&&!busy?`<button id="back">${esc(step.buttons.back)}</button>`:''}${step.type==='form'?`<button id="next">${esc(step.buttons.next)}</button>`:step.type==='review'?`<button id="run">${esc(step.buttons.start)}</button>`:step.type==='result'?`<button id="restart">${esc(step.buttons.restart)}</button>`:''}</div></section>`:`<p>${esc(nodes().length?'Добавьте или выберите сценарий.':'Нет сценариев. Добавьте JSON-файлы в config/packs и перезапустите приложение.')}</p>${path.length?'<button id="up">Назад</button>':''}<div class="section-cards">${nodes().map((n,i)=>`<button class="section-card" data-node="${i}">${esc(n.name)} →</button>`).join('')}</div>`}</main>`;
    const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
    const editorButton=document.createElement('button');editorButton.textContent='Конфигуратор пакетов';editorButton.disabled=busy;app.querySelector('header').append(editorButton);editorButton.onclick=()=>openPackEditor(config,async()=>{config=await loadPacks();pack=null;path=[];render();});
    on('home',()=>{if(!busy){pack=null;path=[];render();}});on('up',()=>{path.pop();render();});
    app.querySelectorAll('[data-node]').forEach(el=>el.onclick=()=>{const i=Number(el.dataset.node),n=nodes()[i];if(n.children)path.push(i);else{pack=config.sections[n.section];index=0;logs=[];inputs=Object.fromEntries(pack.wizard.flatMap(w=>w.fields||[]).map(f=>[f.id,f.default??(f.type==='checkbox'?false:f.type==='select'?f.options[0]?.value:'')]));}render();});
    app.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>inputs[el.dataset.field]=el.type==='checkbox'?el.checked:el.value);
    on('back',()=>{index=Math.max(0,index-1);render();});on('next',()=>{const errors=fieldErrors(step,inputs);if(errors.length)document.querySelector('#error').textContent=errors.join(' ');else{index++;render();}});on('restart',()=>{index=0;logs=[];render();});
    on('run',async()=>{busy=true;index=pack.wizard.findIndex(w=>w.type==='execution');render();try{for(const action of pack.steps.filter(s=>s.enabled)){if(window.__TAURI_INTERNALS__){const {invoke}=await import('@tauri-apps/api/core');if(action.template==='command'){await invoke('execute_command',{executable:action.parameters.executable,arguments:JSON.parse(action.parameters.arguments),workingDirectory:action.parameters.workingDirectory||'.'});}else if(action.template==='inventory'){logs.push(JSON.stringify(await invoke('inventory'),null,2));}else throw Error('Нет обработчика шаблона '+action.template);}logs.push(action.id+': '+(window.__TAURI_INTERNALS__?'Выполнено':'Предпросмотр'));render();}}catch(error){logs.push('Ошибка: '+error.message);}finally{busy=false;index=pack.wizard.findIndex(w=>w.type==='result');render();}});
  }
  render();
}
start().catch(e=>document.querySelector('#app').textContent='Ошибка конфигурации: '+e.message).finally(async()=>{if(window.__TAURI_INTERNALS__){const {invoke}=await import('@tauri-apps/api/core');await invoke('finish_startup');}});
