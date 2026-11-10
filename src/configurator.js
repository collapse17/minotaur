import {validateSection,versioned} from './config.js';

export function openConfigurator(config,profiles,section){
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:90vw;max-width:1100px;max-height:90vh;overflow:auto';
  dialog.innerHTML='<h2>Конфигуратор</h2><p>Конфигурация: разделы, навигация, визарды, поля, кнопки, правила и профили.</p><textarea data-app rows="20" style="width:100%"></textarea><p>Шаблоны</p><textarea data-catalog rows="12" style="width:100%"></textarea><p data-error role="alert"></p><button data-save>Применить и сохранить</button><button data-export>Скачать JSON конфигурации</button><button data-templates>Скачать JSON шаблонов</button><label>Импорт конфигурации<input data-import="app" type="file" accept="application/json"></label><label>Импорт шаблонов<input data-import="catalog" type="file" accept="application/json"></label><button data-close>Закрыть</button>';
  const app=structuredClone(config.app);
  app.sections=Object.values(config.sections).map(s=>({...s,profiles:s.id===section?profiles:s.profiles}));
  const field=key=>dialog.querySelector('[data-'+key+']');
  field('app').value=JSON.stringify(app,null,2);
  field('catalog').value=JSON.stringify(config.catalog,null,2);
  const read=()=>validateDocuments(JSON.parse(field('app').value),JSON.parse(field('catalog').value));
  const safe=fn=>()=>{try{fn();}catch(error){field('error').textContent=error.message;}};
  const download=(name,value)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  field('save').onclick=safe(()=>{const value=read();localStorage.setItem('minotaur.config',JSON.stringify(value.app));localStorage.setItem('minotaur.templates',JSON.stringify(value.catalog));location.reload();});
  field('export').onclick=safe(()=>download('app.json',read().app));
  field('templates').onclick=safe(()=>download('templates.json',read().catalog));
  dialog.querySelectorAll('[data-import]').forEach(el=>el.onchange=async()=>{try{if(el.files[0])field(el.dataset.import).value=JSON.stringify(JSON.parse(await el.files[0].text()),null,2);}catch(error){field('error').textContent=error.message;}});
  field('close').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
}

export function validateDocuments(app,catalog){
  versioned(app,'Конфигурация');versioned(catalog,'Шаблоны');
  const unique=items=>{if(!Array.isArray(items)||!items.length||items.some(x=>!x||typeof x.id!=='string'||!/^[-\w]+$/.test(x.id))||new Set(items.map(x=>x.id)).size!==items.length)throw Error('Неверные или повторные идентификаторы');};
  unique(catalog.templates);unique(app.sections);
  for(const t of catalog.templates){versioned({...t,schemaVersion:1},'Шаблон');if(!t.name||!t.fields||Array.isArray(t.fields)||typeof t.fields!=='object'||Object.values(t.fields).some(v=>typeof v!=='string'))throw Error('Неверный шаблон');}
  app.sections.forEach(s=>{validateSection(s,catalog.templates);unique(s.profiles);});
  const walk=(nodes,depth=0)=>{if(!Array.isArray(nodes)||depth>20)throw Error('Неверная навигация');for(const node of nodes){if(!node||typeof node!=='object')throw Error('Неверный пункт');if(node.children){if(!node.name||node.section)throw Error('Укажите название папки');walk(node.children,depth+1);}else if(!app.sections.some(s=>s.id===node.section))throw Error('Неизвестный раздел навигации');}};
  walk(app.navigation||app.sections.map(s=>({section:s.id})));
  return {app,catalog};
}
