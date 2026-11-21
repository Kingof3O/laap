use super::*;
use crate::local_store::models::Game;

#[test]
fn parses_valorant_most_character_fallback() {
    let fixture = r#"<script>self.__next_f.push([1,"\"profile\":{\"gameName\":\"Kingof3O\",\"tagLine\":\"2516\",\"level\":286,\"region\":\"eu\",\"competitiveTier\":11,\"rank\":null,\"mostCharacterId\":\"A3BFB853-43B2-7238-A4F1-AD90E9E46BCC\",\"puuid\":\"test-puuid\"}"])</script>"#;
    let p = parse_opgg_valorant_html(fixture, "Kingof3O", "2516", "eu").unwrap();
    assert_eq!(p.formatted_rank, "Silver 3");
    assert_eq!(p.top_champions.len(), 1);
    assert_eq!(p.top_champions[0].name, "Reyna");
    assert!(p.top_champions[0].icon_url.contains("A3BFB853-43B2-7238-A4F1-AD90E9E46BCC"));
}

#[test]
fn parses_opgg_meta_description() {
    let html = r#"<html><head><meta name="description" content="Kingof3O#EUW / Platinum 2 17 LP / 136Win 139Lose Win rate 49% / Wukong - 115Win 120Lose Win rate 49%"><img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon3458.jpg"/></head></html>"#;
    let p = parse_opgg_meta(html, "Kingof3O", "EUW", "EUW").unwrap();
    assert_eq!(p.game, Game::League);
    assert_eq!(p.tier, "Platinum");
    assert_eq!(p.rank, "2");
    assert_eq!(p.league_points, 17);
    assert_eq!(p.wins, 136);
    assert_eq!(p.losses, 139);
    assert_eq!(p.win_rate, 49);
    assert_eq!(p.formatted_rank, "Platinum II (17 LP)");
    assert_eq!(p.formatted_win_rate, "136W - 139L (49%)");
    assert_eq!(p.opgg_url, "https://op.gg/lol/summoners/euw/Kingof3O-EUW");
    assert_eq!(
        p.avatar_url.as_deref(),
        Some("https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon3458.jpg")
    );
    assert_eq!(p.top_champions.len(), 1);
    assert_eq!(p.top_champions[0].name, "Wukong");
    assert_eq!(p.top_champions[0].wins, 115);
    assert_eq!(p.top_champions[0].losses, 120);
    assert_eq!(p.top_champions[0].win_rate, 49);
    assert_eq!(
        p.top_champions[0].icon_url,
        "https://opgg-static.akamaized.net/meta/images/lol/latest/champion/MonkeyKing.png"
    );
}

#[test]
fn parses_valorant_rr_combat_and_agents() {
    let fixture = r#"
    <!DOCTYPE html><html><body>
    <script>
    self.__next_f.push([1,"\"profile\":{\"gameName\":\"Kingof3O\",\"tagLine\":\"2516\",\"level\":286,\"region\":\"eu\",\"competitiveTier\":11,\"rank\":64,\"wins\":42,\"losses\":38,\"winRate\":53,\"kd\":1.15,\"headshotRate\":26,\"puuid\":\"test-puuid\"}"]);
    self.__next_f.push([1,"\"agentStats\":[{\"characterId\":\"ADD6443A-41BD-E414-F6AD-E58D267F4E95\",\"agentName\":\"Jett\",\"win\":24,\"lose\":16,\"play\":40,\"winRate\":60},{\"characterId\":\"A3BFB853-43B2-7238-A4F1-AD90E9E46BCC\",\"agentName\":\"Reyna\",\"win\":12,\"lose\":10,\"play\":22,\"winRate\":55}]"]);
    </script>
    </body></html>
    "#;
    let p = parse_opgg_valorant_html(fixture, "Kingof3O", "2516", "EUNE").unwrap();
    assert_eq!(p.game, Game::Valorant);
    assert_eq!(p.formatted_rank, "Silver 3");
    assert_eq!(p.rr, Some(64));
    assert_eq!(p.wins, 42);
    assert_eq!(p.losses, 38);
    assert_eq!(p.win_rate, 53);
    assert_eq!(p.formatted_win_rate, "42W - 38L (53%)");
    assert!(p.combat_stats.is_some());
    let combat = p.combat_stats.unwrap();
    assert_eq!(combat.kd, Some(1.15));
    assert_eq!(combat.headshot_rate, Some(26));
    assert_eq!(p.top_champions.len(), 2);
    assert_eq!(p.top_champions[0].name, "Jett");
    assert_eq!(p.top_champions[0].win_rate, 60);
    assert_eq!(p.top_champions[0].count, 40);
    assert!(p.top_champions[0].icon_url.contains("ADD6443A-41BD-E414-F6AD-E58D267F4E95"));
}

#[test]
fn parses_apex_opgg_meta_description() {
    let html = r#"<html><head><meta name="description" content="Hide on bush#KR1 / Master 831 LP / 448Win 371Lose Win rate 55% / Yone - 31Win"></head></html>"#;
    let p = parse_opgg_meta(html, "Hide on bush", "KR1", "KR").unwrap();
    assert_eq!(p.game, Game::League);
    assert_eq!(p.tier, "Master");
    assert_eq!(p.league_points, 831);
    assert_eq!(p.wins, 448);
    assert_eq!(p.losses, 371);
    assert_eq!(p.win_rate, 55);
    assert_eq!(p.formatted_rank, "Master (831 LP)");
    assert_eq!(p.formatted_win_rate, "448W - 371L (55%)");
}

#[test]
fn valorant_tier_mapping_boundaries() {
    assert_eq!(valorant_tier_to_rank(0), "Unranked");
    assert_eq!(valorant_tier_to_rank(1), "Unranked");
    assert_eq!(valorant_tier_to_rank(2), "Unranked");
    assert_eq!(valorant_tier_to_rank(3), "Iron 1");
    assert_eq!(valorant_tier_to_rank(4), "Iron 2");
    assert_eq!(valorant_tier_to_rank(5), "Iron 3");
    assert_eq!(valorant_tier_to_rank(6), "Bronze 1");
    assert_eq!(valorant_tier_to_rank(7), "Bronze 2");
    assert_eq!(valorant_tier_to_rank(8), "Bronze 3");
    assert_eq!(valorant_tier_to_rank(9), "Silver 1");
    assert_eq!(valorant_tier_to_rank(10), "Silver 2");
    assert_eq!(valorant_tier_to_rank(11), "Silver 3");
    assert_eq!(valorant_tier_to_rank(12), "Gold 1");
    assert_eq!(valorant_tier_to_rank(13), "Gold 2");
    assert_eq!(valorant_tier_to_rank(14), "Gold 3");
    assert_eq!(valorant_tier_to_rank(15), "Platinum 1");
    assert_eq!(valorant_tier_to_rank(16), "Platinum 2");
    assert_eq!(valorant_tier_to_rank(17), "Platinum 3");
    assert_eq!(valorant_tier_to_rank(18), "Diamond 1");
    assert_eq!(valorant_tier_to_rank(19), "Diamond 2");
    assert_eq!(valorant_tier_to_rank(20), "Diamond 3");
    assert_eq!(valorant_tier_to_rank(21), "Ascendant 1");
    assert_eq!(valorant_tier_to_rank(22), "Ascendant 2");
    assert_eq!(valorant_tier_to_rank(23), "Ascendant 3");
    assert_eq!(valorant_tier_to_rank(24), "Immortal 1");
    assert_eq!(valorant_tier_to_rank(25), "Immortal 2");
    assert_eq!(valorant_tier_to_rank(26), "Immortal 3");
    assert_eq!(valorant_tier_to_rank(27), "Radiant");
    assert_eq!(valorant_tier_to_rank(28), "Unranked");
    assert_eq!(valorant_tier_to_rank(99), "Unranked");
}

#[test]
fn parses_valorant_rsc_html_fixture() {
    let fixture = r#"
    <!DOCTYPE html><html><body>
    <script>
    self.__next_f.push([1,"7:[\"$\",\"$L8\",null,{\"profile\":{\"gameName\":\"Jett\",\"tagLine\":\"NA1\",\"level\":52,\"region\":\"na\",\"competitiveTier\":21,\"puuid\":\"c7b12d34-5678-90ab-cdef-1234567890ab\"},\"tierHistories\":[]}]"]);
    </script>
    <img src="https://c-valorant-api.op.gg/Assets/PlayerCards/7B240A91-4925-8BB6-7812-60B49543E145_small.png?image=w_128"/>
    </body></html>
    "#;

    let p = parse_opgg_valorant_html(fixture, "Jett", "NA1", "NA").unwrap();
    assert_eq!(p.game, Game::Valorant);
    assert_eq!(p.summoner_name, "Jett");
    assert_eq!(p.tag_line, "NA1");
    assert_eq!(p.region, "na");
    assert_eq!(p.tier, "Ascendant");
    assert_eq!(p.rank, "1");
    assert_eq!(p.formatted_rank, "Ascendant 1");
    assert_eq!(p.league_points, 0);
    assert_eq!(p.level, Some(52));
    assert_eq!(
        p.puuid.as_deref(),
        Some("c7b12d34-5678-90ab-cdef-1234567890ab")
    );
    assert_eq!(p.opgg_url, "https://op.gg/valorant/profile/Jett-NA1");
    assert_eq!(
        p.avatar_url.as_deref(),
        Some("https://c-valorant-api.op.gg/Assets/PlayerCards/7B240A91-4925-8BB6-7812-60B49543E145_small.png")
    );
}

#[test]
fn parses_valorant_html_fixture_tier_0() {
    let fixture = r#"{"profile":{"gameName":"NewPlayer","tagLine":"0000","level":10,"region":"eu","competitiveTier":0,"puuid":"p-0"}}"#;
    let p = parse_opgg_valorant_html(fixture, "NewPlayer", "0000", "EUW").unwrap();
    assert_eq!(p.formatted_rank, "Unranked");
    assert_eq!(p.tier, "Unranked");
    assert_eq!(p.rank, "");
    assert_eq!(p.level, Some(10));
}

#[test]
fn parses_valorant_html_fixture_tier_3() {
    let fixture = r#"<script>self.__next_f.push([1,"\"profile\":{\"gameName\":\"IronGuy\",\"tagLine\":\"1234\",\"level\":25,\"region\":\"na\",\"competitiveTier\":3,\"puuid\":\"p-3\"}"])</script>"#;
    let p = parse_opgg_valorant_html(fixture, "IronGuy", "1234", "NA").unwrap();
    assert_eq!(p.formatted_rank, "Iron 1");
    assert_eq!(p.tier, "Iron");
    assert_eq!(p.rank, "1");
}

#[test]
fn parses_valorant_html_fixture_tier_26() {
    let fixture = r#"{"profile":{"gameName":"ProGuy","tagLine":"KR1","level":210,"region":"kr","competitiveTier":26,"puuid":"p-26"}}"#;
    let p = parse_opgg_valorant_html(fixture, "ProGuy", "KR1", "KR").unwrap();
    assert_eq!(p.formatted_rank, "Immortal 3");
    assert_eq!(p.tier, "Immortal");
    assert_eq!(p.rank, "3");
}

#[test]
fn parses_valorant_html_fixture_tier_27() {
    let fixture = r#"<script>self.__next_f.push([1,"\"profile\":{\"gameName\":\"RadiantGod\",\"tagLine\":\"VAL\",\"level\":340,\"region\":\"na\",\"competitiveTier\":27,\"puuid\":\"p-27\"}"])</script>"#;
    let p = parse_opgg_valorant_html(fixture, "RadiantGod", "VAL", "NA").unwrap();
    assert_eq!(p.formatted_rank, "Radiant");
    assert_eq!(p.tier, "Radiant");
    assert_eq!(p.rank, "");
}

#[test]
fn parses_valorant_html_fixture_unused_1_and_2() {
    let fixture1 = r#"{"profile":{"gameName":"Unused1","tagLine":"VAL","level":5,"region":"na","competitiveTier":1,"puuid":"p-1"}}"#;
    let p1 = parse_opgg_valorant_html(fixture1, "Unused1", "VAL", "NA").unwrap();
    assert_eq!(p1.formatted_rank, "Unranked");

    let fixture2 = r#"{"profile":{"gameName":"Unused2","tagLine":"VAL","level":5,"region":"na","competitiveTier":2,"puuid":"p-2"}}"#;
    let p2 = parse_opgg_valorant_html(fixture2, "Unused2", "VAL", "NA").unwrap();
    assert_eq!(p2.formatted_rank, "Unranked");
}

#[test]
fn parses_valorant_html_fixture_unknown_28() {
    let fixture = r#"{"profile":{"gameName":"FutureTier","tagLine":"VAL","level":100,"region":"na","competitiveTier":28,"puuid":"p-28"}}"#;
    let p = parse_opgg_valorant_html(fixture, "FutureTier", "VAL", "NA").unwrap();
    assert_eq!(p.formatted_rank, "Unranked");
}

#[test]
fn puuid_identity_check_rules() {
    // Matching PUUIDs pass
    assert!(verify_puuid_identity(Some("puuid-xyz"), Some("puuid-xyz")).is_ok());

    // Mismatched PUUIDs fail with specific error
    let err = verify_puuid_identity(Some("puuid-xyz"), Some("puuid-other")).unwrap_err();
    assert_eq!(
        err,
        "OP.GG returned a different Riot account; saved rank kept."
    );

    // Missing on either side succeeds
    assert!(verify_puuid_identity(None, Some("puuid-xyz")).is_ok());
    assert!(verify_puuid_identity(Some("puuid-xyz"), None).is_ok());
    assert!(verify_puuid_identity(None, None).is_ok());
    assert!(verify_puuid_identity(Some(""), Some("puuid-xyz")).is_ok());
    assert!(verify_puuid_identity(Some("puuid-xyz"), Some("")).is_ok());
}

#[test]
fn unparseable_valorant_page_returns_error() {
    let html = r#"<html><head><meta name="description" content="Search results for Player#NA1"></head><body>Not found</body></html>"#;
    let res = parse_opgg_valorant_html(html, "Player", "NA1", "NA");
    assert!(res.is_err());
    assert_eq!(
        res.unwrap_err(),
        "OP.GG VALORANT profile not found in page"
    );
}

#[test]
fn extracts_league_level_from_html_and_rsc_fixtures() {
    // HTML span fixture (as returned in OP.GG SSR HTML)
    let html_fixture = r#"
        <div class="relative">
            <img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon3458.jpg?image=q_auto:good"/>
            <div class="mt-[-11px] text-center"><span class="inline-flex h-5 rounded-[10px] bg-[var(--color-gray-900)] px-2 text-[12px] leading-5 text-white">197</span></div>
        </div>
    "#;
    assert_eq!(extract_league_level(html_fixture), Some(197));

    // Next.js RSC JSON stream fixture (as returned in streaming chunks)
    let rsc_fixture = r#"
        "className":"relative","children":[["$","img",null,{"src":"https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon3458.jpg"}],["$","div",null,{"className":"mt-[-11px] text-center","children":["$","span",null,{"className":"inline-flex text-white","children":946}]}]]
    "#;
    assert_eq!(extract_league_level(rsc_fixture), Some(946));

    // Meta parsing extracts level alongside rank and winrate
    let full_page = format!(
        r#"<html><head><meta name="description" content="Faker#KR1 / Challenger 1000 LP / 100Win 50Lose Win rate 67%"></head><body>{}</body></html>"#,
        html_fixture
    );
    let prof = parse_opgg_meta(&full_page, "Faker", "KR1", "KR").unwrap();
    assert_eq!(prof.level, Some(197));
    assert_eq!(prof.formatted_rank, "Challenger (1000 LP)");
    assert_eq!(prof.wins, 100);
    assert_eq!(prof.losses, 50);
}
