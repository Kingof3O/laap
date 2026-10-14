//! Byte-preserving framing of XMPP streams and isolated global-presence rewriting.
use crate::launcher_settings::PresenceMode;
use quick_xml::{events::Event, Reader};
use xmltree::{Element, EmitterConfig, XMLNode};
const MAX_FRAME: usize = 256 * 1024;
#[derive(Default)]
pub struct Frames {
    buffer: Vec<u8>,
}
impl Frames {
    pub fn push(&mut self, bytes: &[u8]) -> Result<(), String> {
        if self.buffer.len() + bytes.len() > MAX_FRAME {
            return Err("Chat stanza exceeded the presence size limit.".into());
        }
        self.buffer.extend_from_slice(bytes);
        Ok(())
    }
    pub fn pending(&self) -> bool {
        !self.buffer.is_empty()
    }
    pub fn next(&mut self) -> Result<Option<Vec<u8>>, String> {
        if self.buffer.is_empty() {
            return Ok(None);
        }
        // XMPP deliberately leaves this root open for the lifetime of the stream.
        for prefix in [b"<stream:stream".as_slice(), b"</stream:stream".as_slice()] {
            if self.buffer.starts_with(prefix) {
                if let Some(end) = tag_end(&self.buffer) {
                    return Ok(Some(self.buffer.drain(..end).collect()));
                }
                return Ok(None);
            }
        }
        let mut reader = Reader::from_reader(self.buffer.as_slice());
        let mut depth = 0usize;
        loop {
            let complete = match reader.read_event() {
                Ok(Event::Start(_)) => {
                    depth += 1;
                    if depth > 64 {
                        return Err("Chat XML exceeded its nesting limit.".into());
                    }
                    false
                }
                Ok(Event::End(_)) => {
                    if depth == 0 {
                        return Err("Unexpected chat closing tag.".into());
                    }
                    depth -= 1;
                    depth == 0
                }
                Ok(Event::Empty(_)) => depth == 0,
                Ok(Event::Text(_))
                | Ok(Event::Decl(_))
                | Ok(Event::PI(_))
                | Ok(Event::Comment(_)) => depth == 0,
                Ok(Event::DocType(_)) => {
                    return Err("Document types are not supported in chat stanzas.".into())
                }
                Ok(Event::Eof) => return Ok(None),
                Err(quick_xml::Error::Syntax(_)) => return Ok(None),
                Err(_) => return Err("Invalid chat XML. Presence could not be applied.".into()),
                _ => false,
            };
            if complete {
                let end = reader.buffer_position() as usize;
                return Ok(Some(self.buffer.drain(..end).collect()));
            }
        }
    }
}
fn tag_end(bytes: &[u8]) -> Option<usize> {
    let mut quote = None;
    for (index, byte) in bytes.iter().copied().enumerate() {
        if let Some(current) = quote {
            if byte == current {
                quote = None;
            }
        } else if byte == b'\'' || byte == b'"' {
            quote = Some(byte);
        } else if byte == b'>' {
            return Some(index + 1);
        }
    }
    None
}
pub fn global_presence(frame: &[u8]) -> Result<bool, String> {
    if frame.starts_with(b"</stream:stream") {
        return Ok(false);
    }
    let mut reader = Reader::from_reader(frame);
    match reader.read_event() {
        Ok(Event::Start(element)) | Ok(Event::Empty(element))
            if element.name().as_ref() == b"presence" =>
        {
            for attribute in element.attributes() {
                let attribute = attribute.map_err(|_| "Invalid presence attributes".to_string())?;
                if attribute.key.as_ref() == b"to" && !attribute.value.as_ref().is_empty() {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        Ok(_) => Ok(false),
        Err(_) => Err("Unable to inspect chat stanza".into()),
    }
}
pub fn rewrite(frame: &[u8], mode: PresenceMode) -> Result<Vec<u8>, String> {
    if mode == PresenceMode::Online || !global_presence(frame)? {
        return Ok(frame.to_vec());
    }
    let mut root = Element::parse(frame)
        .map_err(|_| "Unable to apply the offline presence filter".to_string())?;
    root.children
        .retain(|node| !matches!(node, XMLNode::Element(element) if element.name == "status"));
    if let Some(games) = root.get_mut_child("games") {
        games.children.clear();
    }
    if let Some(show) = root.get_mut_child("show") {
        show.children = vec![XMLNode::Text("offline".into())];
    } else {
        let mut show = Element::new("show");
        show.children.push(XMLNode::Text("offline".into()));
        root.children.push(XMLNode::Element(show));
    }
    let mut output = Vec::new();
    root.write_with_config(
        &mut output,
        EmitterConfig::new().write_document_declaration(false),
    )
    .map_err(|_| "Unable to serialize the offline presence filter".to_string())?;
    Ok(output)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_stanzas_never_escape_unfiltered_and_online_restores_the_original() {
        let source = b"<presence><show>chat</show><status>Private activity</status><games><league_of_legends><st>dnd</st></league_of_legends><future_game>active</future_game></games></presence>";
        for split in 1..source.len() {
            let mut frames = Frames::default();
            frames.push(&source[..split]).unwrap();
            assert!(frames.next().unwrap().is_none());
            frames.push(&source[split..]).unwrap();
            let frame = frames.next().unwrap().unwrap();
            let rewritten = rewrite(&frame, PresenceMode::Offline).unwrap();
            let text = String::from_utf8(rewritten).unwrap();
            assert!(text.contains("<show>offline</show>"));
            assert!(
                !text.contains("Private activity")
                    && !text.contains("future_game")
                    && !text.contains("league_of_legends")
            );
            assert_eq!(rewrite(&frame, PresenceMode::Online).unwrap(), source);
        }
    }
    #[test]
    fn directed_lobby_chat_and_authentication_are_preserved() {
        let directed = b"<presence to='party@conference.pvp.net'><show>chat</show><games><league_of_legends/></games></presence>";
        assert_eq!(rewrite(directed, PresenceMode::Offline).unwrap(), directed);
        let stream = b"<?xml version='1.0'?><stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams'><auth>test-only-token</auth><presence/><message to='friend'>Hello</message></stream:stream>";
        let mut frames = Frames::default();
        let mut restored = Vec::new();
        for byte in stream {
            frames.push(&[*byte]).unwrap();
            while let Some(frame) = frames.next().unwrap() {
                restored.extend(frame);
            }
        }
        assert_eq!(restored, stream);
        assert!(!frames.pending());
    }
    #[test]
    fn malformed_and_oversized_stanzas_are_not_forwarded() {
        let mut frames = Frames::default();
        assert!(frames.push(&vec![b'x'; MAX_FRAME + 1]).is_err());
        frames
            .push(b"<!DOCTYPE presence SYSTEM 'file:///private'>")
            .unwrap();
        assert!(frames.next().is_err());
    }
}
