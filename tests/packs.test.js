import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergePacks} from '../src/packs.js';
const base=JSON.parse(await readFile(new URL('../public/config/base.json',import.meta.url)));
const example=JSON.parse(await readFile(new URL('../docs/pack-example.json',import.meta.url)));
test('empty packs produce no tasks',()=>assert.deepEqual(mergePacks(base,[]).navigation,[]));
test('packs share parent folders',()=>{const other=structuredClone(example);other.id='other';other.path[3]='Другой принтер';const c=mergePacks(base,[['one.json',example],['two.json',other]]);assert.equal(c.navigation.length,1);assert.equal(c.navigation[0].children[0].children[0].children.length,2);});
test('rejects duplicate paths and unknown templates with filename',()=>{const other=structuredClone(example);other.id='other';assert.throws(()=>mergePacks(base,[['a',example],['b',other]]),/b:/);other.steps[0].template='missing';assert.throws(()=>mergePacks(base,[['bad.json',other]]),/bad.json:/);});
