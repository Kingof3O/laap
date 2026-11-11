import { randomBytes } from 'node:crypto'
import { MAX_ARCHIVE, parseManifest, validatePackage, type PackageManifest } from './packageValidation.ts'
export const CHUNK_CHARS = 32768
export type TransferMessage =
  | { type:'transferRequest';targetMemberId:string;modHash:string }
  | { type:'transferAccept';transferId:string;manifest:PackageManifest;bytes:number }
  | { type:'transferChunk';transferId:string;chunkIndex:number;dataBase64:string }
  | { type:'transferComplete';transferId:string }
  | { type:'transferCancel';transferId:string }
const key=(v:unknown,n:number):v is string=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`).test(v)
export function parseTransfer(v:Record<string,unknown>):TransferMessage {
  const exact=(...keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
  if(v.type==='transferRequest'&&exact('type','targetMemberId','modHash')&&key(v.targetMemberId,16)&&key(v.modHash,64)) return v as TransferMessage
  if(!key(v.transferId,32))throw Error('Invalid transfer identity')
  if(v.type==='transferAccept'&&exact('type','transferId','manifest','bytes')&&Number.isSafeInteger(v.bytes)&&Number(v.bytes)>0&&Number(v.bytes)<=MAX_ARCHIVE) return {...v,manifest:parseManifest(v.manifest)} as TransferMessage
  if(v.type==='transferChunk'&&exact('type','transferId','chunkIndex','dataBase64')&&Number.isSafeInteger(v.chunkIndex)&&Number(v.chunkIndex)>=0&&typeof v.dataBase64==='string'&&v.dataBase64.length>0&&v.dataBase64.length<=CHUNK_CHARS&&/^[A-Za-z0-9+/]+={0,2}$/.test(v.dataBase64))return v as TransferMessage
  if((v.type==='transferComplete'||v.type==='transferCancel')&&exact('type','transferId'))return v as TransferMessage
  throw Error('Invalid transfer message')
}
interface Transfer {id:string;room:string;sender:string;receiver:string;hash:string;until:number;manifest?:PackageManifest;bytes?:number;chars?:number;chunks:Map<number,string>;validating?:boolean}
export class TransferRelay {
  private transfers=new Map<string,Transfer>()
  private send:(room:string,member:string,event:unknown)=>void
  constructor(send:(room:string,member:string,event:unknown)=>void){this.send=send}
  prune(){for(const [id,t]of this.transfers)if(t.until<Date.now()){this.cancel(t,'Transfer timed out');this.transfers.delete(id)}}
  private cancel(t:Transfer,reason:string){for(const m of [t.sender,t.receiver])this.send(t.room,m,{type:'transferCancel',transferId:t.id,modHash:t.hash,reason});this.transfers.delete(t.id)}
  disconnect(room:string,member:string){for(const t of this.transfers.values())if(t.room===room&&(t.sender===member||t.receiver===member))this.cancel(t,'Peer disconnected; request transfer again')}
  async handle(room:string,member:string,message:TransferMessage,announced:(member:string,hash:string)=>boolean){
    this.prune()
    if(message.type==='transferRequest'){
      if(member===message.targetMemberId||!announced(message.targetMemberId,message.modHash))throw Error('Peer has not announced this package')
      if(this.transfers.size>=16||[...this.transfers.values()].filter(t=>t.room===room).length>=2)throw Error('Transfer capacity exceeded')
      if([...this.transfers.values()].some(t=>t.room===room&&t.hash===message.modHash&&t.receiver===member))throw Error('Transfer already requested')
      const id=randomBytes(16).toString('hex');const t:Transfer={id,room,sender:message.targetMemberId,receiver:member,hash:message.modHash,until:Date.now()+180_000,chunks:new Map()};this.transfers.set(id,t)
      this.send(room,t.sender,{type:'transferRequest',transferId:id,fromMemberId:member,modHash:t.hash});this.send(room,member,{type:'transferPending',transferId:id,fromMemberId:t.sender,modHash:t.hash});return
    }
    const t=this.transfers.get(message.transferId)
    if(!t||t.room!==room||![t.sender,t.receiver].includes(member))throw Error('Transfer not authorized')
    if(message.type==='transferCancel'){this.cancel(t,'Cancelled by participant');return}
    if(member!==t.sender||t.validating)throw Error('Transfer sender required')
    if(message.type==='transferAccept'){
      if(t.manifest||message.manifest.sha256!==t.hash)throw Error('Invalid transfer acceptance')
      if ([...this.transfers.values()].reduce((n,v)=>n+(v.bytes??0),0)+message.bytes>64*1024*1024) throw Error('Aggregate transfer byte quota exceeded')
      t.manifest=message.manifest;t.bytes=message.bytes;t.chars=Math.ceil(message.bytes/3)*4
      this.send(room,t.receiver,{type:'transferAccept',transferId:t.id,fromMemberId:member,modHash:t.hash,manifest:t.manifest,bytes:t.bytes,totalChunks:Math.ceil(t.chars/CHUNK_CHARS)});return
    }
    if(!t.manifest||!t.chars||!t.bytes)throw Error('Sender approval required')
    if(message.type==='transferChunk'){
      const total=Math.ceil(t.chars/CHUNK_CHARS);const expected=message.chunkIndex===total-1?t.chars-CHUNK_CHARS*(total-1):CHUNK_CHARS
      if(message.chunkIndex>=total||message.dataBase64.length!==expected|| (message.chunkIndex!==total-1&&message.dataBase64.includes('=')))throw Error('Invalid chunk bounds')
      const previous=t.chunks.get(message.chunkIndex)
      if(previous){if(previous!==message.dataBase64){this.cancel(t,'Conflicting duplicate chunk');throw Error('Conflicting duplicate chunk')}return}
      t.chunks.set(message.chunkIndex,message.dataBase64);t.until=Date.now()+180_000
      this.send(room,t.receiver,{...message,fromMemberId:member,modHash:t.hash});return
    }
    if(t.chunks.size!==Math.ceil(t.chars/CHUNK_CHARS))throw Error('Incomplete transfer')
    t.validating=true
    const archive=Buffer.from([...t.chunks].sort((a,b)=>a[0]-b[0]).map(c=>c[1]).join(''),'base64')
    try{if(archive.length!==t.bytes)throw Error('Transfer size mismatch');await validatePackage(archive,t.manifest)
      if(this.transfers.get(t.id)!==t)return
      this.send(room,t.receiver,{type:'transferComplete',transferId:t.id,fromMemberId:member,modHash:t.hash});this.transfers.delete(t.id)
    }catch{this.cancel(t,'Archive or checksum validation failed')}
  }
}
