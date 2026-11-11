import { once } from 'node:events'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import WebSocket from 'ws'
import { createCommunityServer } from '../src/party.ts'
import { packageFixture } from './packageFixture.ts'
import { hashBytes } from '../src/packageValidation.ts'
const origin='http://tauri.localhost'
function peer(url:string){
 const socket=new WebSocket(url,{origin});const inbox:Record<string,any>[]=[];socket.on('message',m=>inbox.push(JSON.parse(m.toString())))
 async function next(type:string){const until=Date.now()+3000;while(Date.now()<until){const i=inbox.findIndex(e=>e.type===type);if(i>=0)return inbox.splice(i,1)[0];await new Promise(r=>setTimeout(r,5))}throw Error('Timed out: '+type)}
 return {socket,next,send:(v:unknown)=>socket.send(JSON.stringify(v))}
}
test('real relay transfers a valid archive with consent, rejects forged IDs, duplicates, corruption and cancellation',async()=>{
 const relay=createCommunityServer({origins:new Set([origin])});relay.server.listen(0,'127.0.0.1');await once(relay.server,'listening');const address=relay.server.address();assert(address&&typeof address!=='string');const url=`ws://127.0.0.1:${address.port}/v1/rooms/events`
 try{
  const host=peer(url);await once(host.socket,'open');host.send({type:'create'});await host.next('membership');const created=await host.next('snapshot')
  const guest=peer(url);await once(guest.socket,'open');guest.send({type:'join',invite:created.invite});const identity=await guest.next('membership');await guest.next('snapshot')
  // Multiple real chunks, including nested metadata. Original, generated data only.
  const f=packageFixture([{name:'assets/nested/original.txt',bytes:Buffer.from('original artwork!'.repeat(5000))}]);const hash=f.packageHash
  host.send({type:'announceMods',modHashes:[hash]});await guest.next('snapshot')
  host.send({type:'transferChunk',transferId:'a'.repeat(32),chunkIndex:0,dataBase64:'AAAA'});await host.next('error')
  const request=async()=>{guest.send({type:'transferRequest',targetMemberId:created.self,modHash:hash});const req=await host.next('transferRequest');await guest.next('transferPending');return req.transferId as string}
  const accept=async(id:string)=>{host.send({type:'transferAccept',transferId:id,manifest:f.manifest,bytes:f.archive.length});const e=await guest.next('transferAccept');assert.equal(e.manifest.sha256,hash);return e}
  const id=await request();host.send({type:'transferComplete',transferId:id});await host.next('error');await accept(id)
  const chunks=Array.from({length:Math.ceil(f.archiveBase64.length/32768)},(_,i)=>f.archiveBase64.slice(i*32768,(i+1)*32768))
  // Out of order is supported; identical duplicates are idempotent.
  for(let i=chunks.length-1;i>=0;i--)host.send({type:'transferChunk',transferId:id,chunkIndex:i,dataBase64:chunks[i]})
  host.send({type:'transferChunk',transferId:id,chunkIndex:0,dataBase64:chunks[0]})
  const received=new Map<number,string>();for(let i=0;i<chunks.length;i++){const e=await guest.next('transferChunk');received.set(e.chunkIndex,e.dataBase64)}
  host.send({type:'transferComplete',transferId:id});await guest.next('transferComplete')
  const bytes=Buffer.from([...received].sort((a,b)=>a[0]-b[0]).map(c=>c[1]).join(''),'base64');assert.deepEqual(bytes,f.archive);assert.equal(hashBytes(bytes),hash)
  const cancelled=await request();guest.send({type:'transferCancel',transferId:cancelled});await host.next('transferCancel');await guest.next('transferCancel')
  const corrupt=await request();await accept(corrupt)
  for(let i=0;i<chunks.length;i++)host.send({type:'transferChunk',transferId:corrupt,chunkIndex:i,dataBase64:i===0?'AAAA'+chunks[i].slice(4):chunks[i]})
  host.send({type:'transferComplete',transferId:corrupt});await guest.next('transferCancel');await host.next('transferCancel')
  const interrupted=await request();await accept(interrupted);guest.socket.terminate();await host.next('transferCancel')
  const resume=peer(url);await once(resume.socket,'open');resume.send({type:'resume',room:identity.room,token:identity.token});await resume.next('membership');const restored=await resume.next('snapshot');assert.equal(restored.members.length,2)
 }finally{await relay.close()}
})
