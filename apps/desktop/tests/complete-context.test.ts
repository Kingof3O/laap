import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { resolveProfileContext } from '../src/features/customization/completeContext.ts'
test('Complete context resolves three opaque IDs, follows rename, clears general Studio and drops deleted identity',()=>{
 const profiles=[{id:'a',name:'Alpha'},{id:'b',name:'Beta'},{id:'c',name:'Gamma'}]
 for(const p of profiles)assert.equal(resolveProfileContext(p.id,profiles)?.name,p.name)
 assert.equal(resolveProfileContext('b',[profiles[0],{id:'b',name:'Renamed'},profiles[2]])?.name,'Renamed')
 assert.equal(resolveProfileContext(null,profiles),undefined)
 assert.equal(resolveProfileContext('b',[profiles[0],profiles[2]]),undefined)
})
