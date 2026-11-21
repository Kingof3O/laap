pub fn league_champion_key(name: &str) -> &'static str {
    match name.trim().to_ascii_lowercase().as_str() {
        "wukong" => "MonkeyKing",
        "cho'gath" | "chogath" => "Chogath",
        "kai'sa" | "kaisa" => "Kaisa",
        "kha'zix" | "khazix" => "Khazix",
        "vel'koz" | "velkoz" => "Velkoz",
        "bel'veth" | "belveth" => "Belveth",
        "kog'maw" | "kogmaw" => "KogMaw",
        "rek'sai" | "reksai" => "RekSai",
        "k'sante" | "ksante" => "KSante",
        "dr. mundo" | "dr mundo" | "drmundo" => "DrMundo",
        "jarvan iv" | "jarvaniv" => "JarvanIV",
        "master yi" | "masteryi" => "MasterYi",
        "miss fortune" | "missfortune" => "MissFortune",
        "tahm kench" | "tahmkench" => "TahmKench",
        "twisted fate" | "twistedfate" => "TwistedFate",
        "xin zhao" | "xinzhao" => "XinZhao",
        "aurelion sol" | "aurelionsol" => "AurelionSol",
        "lee sin" | "leesin" => "LeeSin",
        "nunu & willump" | "nunu" => "Nunu",
        "renata glasc" | "renata" => "Renata",
        "leblanc" => "Leblanc",
        _ => "",
    }
}

pub fn league_champion_icon_url(name: &str) -> String {
    let key = league_champion_key(name);
    let resolved_key = if !key.is_empty() {
        key.to_string()
    } else {
        name.chars().filter(|c| c.is_alphanumeric()).collect()
    };
    format!(
        "https://opgg-static.akamaized.net/meta/images/lol/latest/champion/{}.png",
        resolved_key
    )
}

pub fn valorant_agent_icon_url(name: &str) -> String {
    let id = match name.trim().to_ascii_lowercase().as_str() {
        "astra" => "41FB69C1-4189-7B37-F117-BCAF1E96F1BF",
        "breach" => "5F8D3A7F-467B-97F3-062C-13ACF203C006",
        "brimstone" => "9F0AC8B4-4CE8-0815-A407-BCDAAC1F641E",
        "chamber" => "22697A3D-45BF-8DD7-4FEC-84A9E28C69D7",
        "clove" => "1DBF2EDD-4729-0984-3115-DAA5EED44993",
        "cypher" => "117ED9E3-49F3-6512-3CCF-0CADA7E3823B",
        "deadlock" => "CC8B64C8-4B25-4FF9-6E7F-37B4DA43D235",
        "fade" => "DADE69B4-4F5A-8528-247B-219E5A1FACD6",
        "gekko" => "E370FA57-4757-3604-3648-499E1F642D3F",
        "harbor" => "95B78ED7-4637-86D9-7E41-71BA8C293152",
        "iso" => "0E38B510-41A8-5780-5E8F-568B2A4F2D6C",
        "jett" => "ADD6443A-41BD-E414-F6AD-E58D267F4E95",
        "kay/o" | "kayo" => "601D3B66-4526-4ED2-8A39-50AA4557074C",
        "killjoy" => "1E58DE9C-4950-5125-93E9-A0AEE9F98746",
        "neon" => "BB2A4828-46EB-8CD1-E765-15848195D751",
        "omen" => "8E253930-4C05-31DD-1B6C-968525494517",
        "phoenix" => "EB93336A-449B-9C1B-0A54-A891F7921D69",
        "raze" => "F94C3B30-42BE-E959-889C-5AA313DBA261",
        "reyna" => "A3BFB853-43B2-7238-A4F1-AD90E9E46BCC",
        "sage" => "569FDD95-4D10-43AB-CA70-79BECC718B46",
        "skye" => "6F2A04CA-43E0-BE17-7F36-B3908627744D",
        "sova" => "320B2A48-4D9B-A075-30F1-1F93A9B638FA",
        "tejo" => "B444168C-4E35-8076-DB47-EF9BF368F384",
        "viper" => "707EAB51-4836-F488-046A-CDA6BF494859",
        "vyse" => "BBA5359-4016-A1E5-7626-B1AE76895940",
        "yoru" => "7F94D92C-4234-0A36-9646-3A87EB8B5C89",
        _ => "",
    };
    if !id.is_empty() {
        format!(
            "https://c-valorant-api.op.gg/Assets/Characters/{}_small.png",
            id
        )
    } else {
        format!(
            "https://opgg-static.akamaized.net/meta/images/valorant/agent/{}.png",
            name.to_ascii_lowercase()
        )
    }
}

pub fn valorant_agent_from_id(id: &str) -> Option<&'static str> {
    match id.to_uppercase().as_str() {
        "41FB69C1-4189-7B37-F117-BCAF1E96F1BF" => Some("Astra"),
        "5F8D3A7F-467B-97F3-062C-13ACF203C006" => Some("Breach"),
        "9F0D8BA9-4140-B941-57D3-A7AD57C6B417" => Some("Brimstone"),
        "22697A3D-45BF-8DD7-4FEC-84A9E28C69D7" => Some("Chamber"),
        "1DBF2EDD-4729-0984-3115-DAA5EED44993" => Some("Clove"),
        "117ED9E3-49F3-6512-3CCF-0CADA7E3823B" => Some("Cypher"),
        "CC8B64C8-4B25-4FF9-6E7F-37B4DA43D235" => Some("Deadlock"),
        "DADE69B4-4F5A-8528-247B-219E5A1FACD6" => Some("Fade"),
        "E370FA57-4757-3604-3648-499E1F642D3F" => Some("Gekko"),
        "95B78ED7-4637-86D9-7E41-71BA8C293152" => Some("Harbor"),
        "0E38B510-41A8-5780-5E8F-568B2A4F2D6C" => Some("Iso"),
        "ADD6443A-41BD-E414-F6AD-E58D267F4E95" => Some("Jett"),
        "601DBBE7-43CE-BE57-2A40-4ABD24953621" => Some("KAY/O"),
        "1E58DE9C-4950-5125-93E9-A0AEE9F98746" => Some("Killjoy"),
        "BB2A4828-46EB-8CD1-E765-15848195D751" => Some("Neon"),
        "8E253930-4C05-31DD-1B6C-968525494517" => Some("Omen"),
        "EB93336A-449B-9C1B-0A54-A891F7921D69" => Some("Phoenix"),
        "F94C3B30-42BE-E959-889C-5AA313DBA261" => Some("Raze"),
        "A3BFB853-43B2-7238-A4F1-AD90E9E46BCC" => Some("Reyna"),
        "569FDD95-4D10-43AB-CA70-79BECC718B46" => Some("Sage"),
        "6F2A04CA-43E0-BE17-7F36-B3908627744D" => Some("Skye"),
        "320B2A48-4D9B-A075-30F1-1F93A9B638FA" => Some("Sova"),
        "707EAB51-4836-F488-046A-CDA6BF494859" => Some("Viper"),
        "EFBA5359-4016-A1E5-7626-B1AE76895940" => Some("Vyse"),
        "7F94D92C-4234-0A36-9646-3A87EB8B5C89" => Some("Yoru"),
        _ => None,
    }
}
