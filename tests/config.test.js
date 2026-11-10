import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadConfig,validateSection,fieldErrors,validateProfile} from '../src/config.js';
const read=async name=>JSON.parse(await readFile(new URL('../public/config/'+name,import.meta.url),'utf8'));
globalThis.fetch=async url=>({ok:true,json:()=>read(url.split('/').at(-1))});
test('loads all versioned sections and profiles',async()=>{const c=await loadConfig();assert.equal(Object.keys(c.sections).length,3);assert.equal(c.sections.configure.profiles[0].section,'configure');});
test('supports an additional JSON form step and typed inputs',async()=>{const c=await loadConfig(),s=structuredClone(c.sections.prepare);s.wizard.splice(1,0,{id:'location',type:'form',label:'Расположение',title:'Расположение',fields:[{id:'room',type:'number',label:'Кабинет',required:true,min:1},{id:'role',type:'select',label:'Роль',options:[{label:'Офис',value:'office'}]}]});validateSection(s,c.catalog.templates);assert.equal(fieldErrors(s.wizard[1],{room:'12',role:'office'}).length,0);assert.equal(fieldErrors(s.wizard[1],{room:'0',role:'other'}).length,2);});
test('rejects incompatible versions and template revisions',async()=>{const c=await loadConfig(),s=structuredClone(c.sections.prepare);s.schemaVersion=2;assert.throws(()=>validateSection(s,c.catalog.templates));const p=structuredClone(c.sections.prepare.profiles[0]);p.steps[0].templateVersion='9.0.0';assert.throws(()=>validateProfile(p,'prepare',c.catalog.templates));});
test('rejects duplicate fields and incorrect wizard order',async()=>{const c=await loadConfig(),s=structuredClone(c.sections.prepare);s.wizard[0].fields.push(s.wizard[0].fields[0]);assert.throws(()=>validateSection(s,c.catalog.templates));});

test('accepts equal and older versions; rejects future and malformed versions',async()=>{const {acceptVersion,versioned}=await import('../src/config.js');for(const v of ['0.9.9','1.0.0'])assert.doesNotThrow(()=>versioned({schemaVersion:1,version:v},'Тест'));for(const v of ['1.0.1','1.1.0','2.0.0'])assert.throws(()=>versioned({schemaVersion:1,version:v},'Тест'),/новее поддерживаемой/);assert.doesNotThrow(()=>versioned({schemaVersion:0,version:'0.1.0'},'Тест'));assert.throws(()=>acceptVersion('1.10.0','1.2.0'),/новее/);assert.doesNotThrow(()=>acceptVersion('1.2.0','1.10.0'));for(const v of ['1.0','abc','01.0.0'])assert.throws(()=>acceptVersion(v));});
test('accepts older template references and rejects future catalog versions',async()=>{const c=await loadConfig(),p=structuredClone(c.sections.prepare.profiles[0]);p.steps[0].templateVersion='0.9.0';assert.doesNotThrow(()=>validateProfile(p,'prepare',c.catalog.templates));});


