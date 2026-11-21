export const LEAGUE_CHAMPION_KEY_MAP: Record<string, string> = {
  wukong: 'MonkeyKing',
  "cho'gath": 'Chogath',
  chogath: 'Chogath',
  "kai'sa": 'Kaisa',
  kaisa: 'Kaisa',
  "kha'zix": 'Khazix',
  khazix: 'Khazix',
  "vel'koz": 'Velkoz',
  velkoz: 'Velkoz',
  "bel'veth": 'Belveth',
  belveth: 'Belveth',
  "kog'maw": 'KogMaw',
  kogmaw: 'KogMaw',
  "rek'sai": 'RekSai',
  reksai: 'RekSai',
  "k'sante": 'KSante',
  ksante: 'KSante',
  'dr. mundo': 'DrMundo',
  'dr mundo': 'DrMundo',
  drmundo: 'DrMundo',
  'jarvan iv': 'JarvanIV',
  jarvaniv: 'JarvanIV',
  'master yi': 'MasterYi',
  masteryi: 'MasterYi',
  'miss fortune': 'MissFortune',
  missfortune: 'MissFortune',
  'tahm kench': 'TahmKench',
  tahmkench: 'TahmKench',
  'twisted fate': 'TwistedFate',
  twistedfate: 'TwistedFate',
  'xin zhao': 'XinZhao',
  xinzhao: 'XinZhao',
  'aurelion sol': 'AurelionSol',
  aurelionsol: 'AurelionSol',
  'lee sin': 'LeeSin',
  leesin: 'LeeSin',
  'nunu & willump': 'Nunu',
  nunu: 'Nunu',
  'renata glasc': 'Renata',
  renata: 'Renata',
  leblanc: 'Leblanc',
}

export function leagueChampionKey(name: string): string {
  return LEAGUE_CHAMPION_KEY_MAP[name.trim().toLowerCase()] ?? ''
}

export function leagueChampionIconUrl(name: string): string {
  const key = leagueChampionKey(name)
  const resolved = key || name.replace(/[^a-zA-Z0-9]/g, '')
  return `https://opgg-static.akamaized.net/meta/images/lol/latest/champion/${resolved}.png`
}

export const VALORANT_AGENT_ID_MAP: Record<string, string> = {
  '41FB69C1-4189-7B37-F117-BCAF1E96F1BF': 'Astra',
  '5F8D3A7F-467B-97F3-062C-13ACF203C006': 'Breach',
  '9F0AC8B4-4CE8-0815-A407-BCDAAC1F641E': 'Brimstone',
  '9F0D8BA9-4140-B941-57D3-A7AD57C6B417': 'Brimstone',
  '22697A3D-45BF-8DD7-4FEC-84A9E28C69D7': 'Chamber',
  '1DBF2EDD-4729-0984-3115-DAA5EED44993': 'Clove',
  '117ED9E3-49F3-6512-3CCF-0CADA7E3823B': 'Cypher',
  'CC8B64C8-4B25-4FF9-6E7F-37B4DA43D235': 'Deadlock',
  'DADE69B4-4F5A-8528-247B-219E5A1FACD6': 'Fade',
  'E370FA57-4757-3604-3648-499E1F642D3F': 'Gekko',
  '95B78ED7-4637-86D9-7E41-71BA8C293152': 'Harbor',
  '0E38B510-41A8-5780-5E8F-568B2A4F2D6C': 'Iso',
  'ADD6443A-41BD-E414-F6AD-E58D267F4E95': 'Jett',
  '601D3B66-4526-4ED2-8A39-50AA4557074C': 'KAY/O',
  '601DBBE7-43CE-BE57-2A40-4ABD24953621': 'KAY/O',
  '1E58DE9C-4950-5125-93E9-A0AEE9F98746': 'Killjoy',
  'BB2A4828-46EB-8CD1-E765-15848195D751': 'Neon',
  '8E253930-4C05-31DD-1B6C-968525494517': 'Omen',
  'EB93336A-449B-9C1B-0A54-A891F7921D69': 'Phoenix',
  'F94C3B30-42BE-E959-889C-5AA313DBA261': 'Raze',
  'A3BFB853-43B2-7238-A4F1-AD90E9E46BCC': 'Reyna',
  '569FDD95-4D10-43AB-CA70-79BECC718B46': 'Sage',
  '6F2A04CA-43E0-BE17-7F36-B3908627744D': 'Skye',
  '320B2A48-4D9B-A075-30F1-1F93A9B638FA': 'Sova',
  'B444168C-4E35-8076-DB47-EF9BF368F384': 'Tejo',
  '707EAB51-4836-F488-046A-CDA6BF494859': 'Viper',
  'BBA5359-4016-A1E5-7626-B1AE76895940': 'Vyse',
  'EFBA5359-4016-A1E5-7626-B1AE76895940': 'Vyse',
  '7F94D92C-4234-0A36-9646-3A87EB8B5C89': 'Yoru',
}

export function valorantAgentFromId(id: string): string | null {
  return VALORANT_AGENT_ID_MAP[id.toUpperCase()] ?? null
}

export function valorantAgentIconUrl(name: string): string {
  const map: Record<string, string> = {
    astra: '41FB69C1-4189-7B37-F117-BCAF1E96F1BF',
    breach: '5F8D3A7F-467B-97F3-062C-13ACF203C006',
    brimstone: '9F0AC8B4-4CE8-0815-A407-BCDAAC1F641E',
    chamber: '22697A3D-45BF-8DD7-4FEC-84A9E28C69D7',
    clove: '1DBF2EDD-4729-0984-3115-DAA5EED44993',
    cypher: '117ED9E3-49F3-6512-3CCF-0CADA7E3823B',
    deadlock: 'CC8B64C8-4B25-4FF9-6E7F-37B4DA43D235',
    fade: 'DADE69B4-4F5A-8528-247B-219E5A1FACD6',
    gekko: 'E370FA57-4757-3604-3648-499E1F642D3F',
    harbor: '95B78ED7-4637-86D9-7E41-71BA8C293152',
    iso: '0E38B510-41A8-5780-5E8F-568B2A4F2D6C',
    jett: 'ADD6443A-41BD-E414-F6AD-E58D267F4E95',
    'kay/o': '601D3B66-4526-4ED2-8A39-50AA4557074C',
    kayo: '601D3B66-4526-4ED2-8A39-50AA4557074C',
    killjoy: '1E58DE9C-4950-5125-93E9-A0AEE9F98746',
    neon: 'BB2A4828-46EB-8CD1-E765-15848195D751',
    omen: '8E253930-4C05-31DD-1B6C-968525494517',
    phoenix: 'EB93336A-449B-9C1B-0A54-A891F7921D69',
    raze: 'F94C3B30-42BE-E959-889C-5AA313DBA261',
    reyna: 'A3BFB853-43B2-7238-A4F1-AD90E9E46BCC',
    sage: '569FDD95-4D10-43AB-CA70-79BECC718B46',
    skye: '6F2A04CA-43E0-BE17-7F36-B3908627744D',
    sova: '320B2A48-4D9B-A075-30F1-1F93A9B638FA',
    tejo: 'B444168C-4E35-8076-DB47-EF9BF368F384',
    viper: '707EAB51-4836-F488-046A-CDA6BF494859',
    vyse: 'BBA5359-4016-A1E5-7626-B1AE76895940',
    yoru: '7F94D92C-4234-0A36-9646-3A87EB8B5C89',
  }
  const id = map[name.trim().toLowerCase()]
  if (id) {
    return `https://c-valorant-api.op.gg/Assets/Characters/${id}_small.png`
  }
  return `https://opgg-static.akamaized.net/meta/images/valorant/agent/${name.trim().toLowerCase()}.png`
}
