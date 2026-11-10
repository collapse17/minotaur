import {versioned,validateProfile} from './config.js';

export function mergePacks(base,entries){
  versioned(base,'Базовая конфигурация');
  const templates=base.templates, navigation=[],sections={};
  if(!Array.isArray(templates))throw Error('Нет стандартных шаблонов');
  for(const [file,raw] of entries){
    try{
      const pack=structuredClone(raw);versioned(pack,'Пакет');
      if(typeof pack.id!=='string'||!/^[-a-zA-Z0-9_]+$/.test(pack.id)||Object.hasOwn(sections,pack.id)||!Array.isArray(pack.path)||!pack.path.length||pack.path.some(x=>typeof x!=='string'||!x.trim()))throw Error('Неверный id или путь');
      if(!Array.isArray(pack.wizard)||!pack.wizard.length||pack.wizard.some(w=>!['form','review','execution','result'].includes(w.type)||!w.id||!w.title))throw Error('Неверный визард');
      if(new Set(pack.wizard.map(w=>w.id)).size!==pack.wizard.length)throw Error('Повторные шаги');
      for(const type of ['review','execution','result'])if(pack.wizard.filter(w=>w.type===type).length!==1)throw Error('Нужен один шаг '+type);
      const review=pack.wizard.findIndex(w=>w.type==='review');
      if(pack.wizard.at(-1).type!=='result'||pack.wizard.findIndex(w=>w.type==='execution')!==review+1||pack.wizard.some((w,i)=>w.type==='form'&&i>review))throw Error('Неверный порядок визарда');
      for(const w of pack.wizard){w.buttons={...base.buttons,...w.buttons};if(w.type==='form'&&(!Array.isArray(w.fields)||w.fields.some(f=>!f.id||!['text','number','select','checkbox','textarea'].includes(f.type)||!f.label||(f.type==='select'&&!Array.isArray(f.options)))))throw Error('Неверные поля формы');}
      const fields=pack.wizard.flatMap(w=>w.fields||[]);
      if(new Set(fields.map(f=>f.id)).size!==fields.length)throw Error('ID полей должны быть уникальными во всём мастере');
      for(const f of fields){if(!/^[-a-zA-Z0-9_]+$/.test(f.id))throw Error('Неверный ID поля');if(f.pattern)new RegExp(f.pattern);if(f.type==='select'&&(!f.options.length||f.options.some(o=>typeof o.value!=='string'||typeof o.label!=='string')))throw Error('Нужны варианты выбора');if(f.min!==undefined&&f.max!==undefined&&f.min>f.max)throw Error('Минимум больше максимума');}
      validateProfile({...pack,name:pack.path.at(-1),section:pack.id},pack.id,templates);
      pack.name=pack.path.at(-1);sections[pack.id]=pack;
      let nodes=navigation;
      pack.path.forEach((name,i)=>{let node=nodes.find(n=>n.name===name);if(i===pack.path.length-1){if(node)throw Error('Путь уже занят');nodes.push({name,section:pack.id});}else{if(node&&!node.children)throw Error('Путь пересекается с визардом');if(!node){node={name,children:[]};nodes.push(node);}nodes=node.children;}});
    }catch(error){throw Error(file+': '+error.message);}
  }
  return {base,templates,navigation,sections};
}

export async function loadPacks(){
  let base,entries;
  if(window.__TAURI_INTERNALS__){const {invoke}=await import('@tauri-apps/api/core');const data=await invoke('read_config_packs');base=data.base;entries=data.packs.map(p=>[p.file,p.value]);}
  else {const response=await fetch('/config/base.json');if(!response.ok)throw Error('Нет config/base.json');base=await response.json();entries=Object.entries(import.meta.glob('../public/config/packs/*.json',{eager:true,import:'default'}));}
  return mergePacks(base,entries);
}
