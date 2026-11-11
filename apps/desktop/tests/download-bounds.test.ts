import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readResponseBytes } from '../src/features/customization/packageFiles.ts'
test('download streams are bounded, truncation is rejected and successful bytes are preserved',async()=>{
 const original=new Uint8Array([1,2,3]);assert.deepEqual(await readResponseBytes(new Response(original,{headers:{'content-length':'3'}}),10),original)
 await assert.rejects(readResponseBytes(new Response(original,{headers:{'content-length':'1000'}}),10),/limit/)
 await assert.rejects(readResponseBytes(new Response(original,{headers:{'content-length':'4'}}),10),/truncated/)
 await assert.rejects(readResponseBytes(new Response(new Uint8Array(11)),10),/limit/)
})
