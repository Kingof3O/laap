import { useEffect, useRef, useState } from "react";
import { invokeTauri } from "../../lib/api";
import { errorMessage, type AiResponse, type TtsResponse } from "./api";
interface Stats {
  summonerName: string;
  tagLine: string;
  region: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  fetchedAt: number;
  source: string;
}
export function ProviderSettings() {
  const [provider, setProvider] = useState("openai");
  const [key, setKey] = useState("");
  const [keyProvider, setKeyProvider] = useState("openai");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [audio, setAudio] = useState("");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("EUW1");
  const [stats, setStats] = useState<Stats | null>(null);
  const current = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (current.current)
        void invokeTauri("provider_cancel", { requestId: current.current });
    },
    [],
  );
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  async function run(work: (id: string) => Promise<void>) {
    const id = crypto.randomUUID().replaceAll("-", "");
    current.current = id;
    setBusy(true);
    setError("");
    try {
      await work(id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      current.current = null;
      setBusy(false);
    }
  }
  const model = provider === "openai" ? "gpt-4.1-mini" : "gemini-3.8-flash";
  return (
    <section className="customization-editor">
      <h3>Optional providers</h3>
      <p>
        Each request sends only the text or Riot ID entered below to the
        selected provider. Keys stay in the OS credential store. These are
        billable APIs; requests are never automatically retried.
      </p>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      <label>
        Credential provider
        <select
          value={keyProvider}
          onChange={(e) => setKeyProvider(e.target.value)}
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Google Gemini</option>
          <option value="elevenlabs">ElevenLabs</option>
          <option value="riot">Riot Games</option>
        </select>
      </label>
      <label>
        API key
        <input
          type="password"
          autoComplete="off"
          maxLength={512}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <div className="customization-actions">
        <button
          disabled={busy || key.length < 16}
          onClick={() =>
            void run(async () => {
              await invokeTauri("provider_key_save", {
                provider: keyProvider,
                key,
              });
              setKey("");
              setStatus("Key saved in the OS credential store.");
            })
          }
        >
          Save key securely
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await invokeTauri("provider_key_clear", {
                provider: keyProvider,
              });
              setStatus(
                "Saved key removed. Environment-provided keys, if any, remain managed externally.",
              );
            })
          }
        >
          Remove saved key
        </button>
      </div>
      <label className="customization-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!e.target.checked && current.current)
              void invokeTauri("provider_cancel", {
                requestId: current.current,
              });
          }}
        />
        I consent to sending the entered content to the selected provider and
        any charges under my API account.
      </label>
      <h4>Creator assistance</h4>
      <label>
        AI provider
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="openai">OpenAI · GPT-4.1 mini</option>
          <option value="gemini">Google · Gemini 3.8 Flash</option>
        </select>
      </label>
      <label>
        Creator question
        <textarea
          maxLength={4000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <p>Output limit: 800 tokens. Review generated advice before using it.</p>
      <button
        disabled={busy || !consent || !prompt.trim()}
        onClick={() =>
          void run(async (requestId) => {
            setAnswer("");
            const result = await invokeTauri<AiResponse>("ai_chat", {
              prompt,
              provider,
              model,
              consent,
              requestId,
            });
            setAnswer(result.message);
          })
        }
      >
        Ask provider
      </button>
      {answer && <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>}
      <h4>Speech</h4>
      <label>
        Authorized ElevenLabs voice ID
        <input
          value={voice}
          maxLength={64}
          onChange={(e) => setVoice(e.target.value)}
        />
      </label>
      <label>
        Text (up to 1,000 characters)
        <textarea
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !consent || !voice || !text.trim()}
        onClick={() =>
          void run(async (requestId) => {
            const r = await invokeTauri<TtsResponse>("elevenlabs_tts", {
              text,
              voiceId: voice,
              consent,
              requestId,
            });
            if (r.format !== "audio/mpeg")
              throw Error("Unsupported audio response");
            const bytes = Uint8Array.from(atob(r.audioBase64), (c) =>
              c.charCodeAt(0),
            );
            setAudio(
              URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })),
            );
            setStatus("Audio received. Use the player to verify playback.");
          })
        }
      >
        Generate speech
      </button>
      {audio && (
        <div>
          <audio
            controls
            src={audio}
            onError={() =>
              setError(
                "Audio could not be decoded. Provider returned unusable audio.",
              )
            }
          />
          <a href={audio} download="laap-speech.mp3">
            Save MP3
          </a>
        </div>
      )}
      <h4>Official Riot statistics</h4>
      <label>
        Riot ID
        <input
          placeholder="Name#Tag"
          value={query}
          maxLength={49}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        Platform region
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          {[
            "NA1",
            "BR1",
            "LA1",
            "LA2",
            "EUW1",
            "EUN1",
            "TR1",
            "RU",
            "ME1",
            "KR",
            "JP1",
            "OC1",
            "SG2",
            "TW2",
            "VN2",
          ].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !consent || !query.includes("#")}
        onClick={() =>
          void run(async () => {
            const i = query.lastIndexOf("#");
            setStats(null);
            setStats(
              await invokeTauri<Stats>("opgg_get_summoner_profile", {
                summonerName: query.slice(0, i),
                tagLine: query.slice(i + 1),
                region,
                consent,
              }),
            );
          })
        }
      >
        Look up Solo/Duo stats
      </button>
      {stats && (
        <p>
          {stats.summonerName}#{stats.tagLine} · {stats.region} · {stats.tier}{" "}
          {stats.rank} · {stats.leaguePoints} LP · {stats.wins}W /{" "}
          {stats.losses}L<br />
          {stats.source} · fetched{" "}
          {new Date(stats.fetchedAt * 1000).toLocaleString()}
        </p>
      )}
      {busy && (
        <button
          onClick={() => {
            if (current.current)
              void invokeTauri("provider_cancel", {
                requestId: current.current,
              }).then((cancelled) => {
                if (!cancelled)
                  setStatus(
                    "This stats request has a bounded timeout and cannot be cancelled mid-response.",
                  );
              });
          }}
        >
          Cancel provider request
        </button>
      )}
    </section>
  );
}
