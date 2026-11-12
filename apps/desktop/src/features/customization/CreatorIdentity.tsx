import { useEffect, useState } from "react";
import { invokeTauri } from "../../lib/api";
import { readFileBase64 } from "./packageFiles";
import { errorMessage } from "./api";
export interface CreatorCredential {
  id: string;
  authToken: string;
}
export interface OwnSubmission {
  packageHash: string;
  title: string;
  version: string;
  status: string;
  moderationNote: string | null;
}
export async function marketplaceRequest(
  origin: string,
  path: string,
  data?: unknown,
  credential?: CreatorCredential,
  method?: string,
) {
  const res = await fetch(origin + "/v1/marketplace" + path, {
    method: method ?? (data === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(credential
        ? { Authorization: "Bearer " + credential.authToken }
        : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    let message = "Community request failed (" + res.status + ")";
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* no JSON body */
    }
    throw Error(message);
  }
  return res;
}
export function CreatorIdentity({
  origin,
  onChange,
}: {
  origin: string;
  onChange: (value: CreatorCredential | null) => void;
}) {
  const [credential, setCredential] = useState<CreatorCredential | null>(null);
  const [name, setName] = useState("");
  const [recovery, setRecovery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<OwnSubmission[]>([]);
  const [recoveryCopy, setRecoveryCopy] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  async function accept(received: CreatorCredential) {
    if (typeof received?.id !== 'string' || !received.id || received.id.length > 64 ||
      typeof received.authToken !== 'string' || !/^[a-f0-9]{64}$/.test(received.authToken)) throw Error('Invalid creator credential response.')
    // Registration also returns profile metadata. Only this strict credential
    // contract may cross the native secret-store boundary.
    const value: CreatorCredential = { id: received.id, authToken: received.authToken }
    const res = await marketplaceRequest(origin, "/creator", undefined, value);
    const profile = (await res.json()) as { id: string; displayName: string };
    if (profile.id !== value.id) throw Error("Creator identity mismatch");
    setCredential(value);
    setName(profile.displayName);
    onChange(value);
    try {
      await invokeTauri("community_credential_save", {
        origin,
        credential: value,
      });
    } catch (e) {
      setError(
        "Signed in for this session. Secure persistence failed: " +
          errorMessage(e),
      );
    }
    setMine(
      await (
        await marketplaceRequest(origin, "/my-submissions", undefined, value)
      ).json(),
    );
  }
  useEffect(() => {
    let alive = true;
    void invokeTauri<CreatorCredential | null>("community_credential_load", {
      origin,
    })
      .then((v) => {
        if (alive && v) void accept(v).catch((e) => setError(errorMessage(e)));
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [origin]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="customization-editor">
      <summary>
        {credential ? "Creator: " + name : "Creator account / recovery"}
      </summary>
      <p>
        Independent community identity. Never enter Riot credentials. Save your
        recovery token privately; lost tokens cannot be recovered by a display
        name.
      </p>
      {error && <p role="alert">{error}</p>}
      {profileStatus && <p role="status">{profileStatus}</p>}
      {!credential ? (
        <>
          <label>
            Display name
            <input
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className="btn-secondary"
            disabled={busy || !name.trim()}
            onClick={() =>
              void run(async () => {
                const c = (await (
                  await marketplaceRequest(origin, "/creator", {
                    displayName: name.trim(),
                  })
                ).json()) as CreatorCredential;
                setRecoveryCopy(c.authToken);
                await accept(c);
              })
            }
          >
            Create community identity
          </button>
          <label>
            Recovery token
            <input
              type="password"
              autoComplete="off"
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
              maxLength={64}
            />
          </label>
          <button
            className="btn-secondary"
            disabled={busy || !/^[a-f0-9]{64}$/.test(recovery)}
            onClick={() =>
              void run(async () => {
                const profile = (await (
                  await marketplaceRequest(origin, "/creator", undefined, {
                    id: "",
                    authToken: recovery,
                  })
                ).json()) as { id: string };
                await accept({ id: profile.id, authToken: recovery });
                setRecovery("");
              })
            }
          >
            Recover identity
          </button>
        </>
      ) : (
        <>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setMine(
                  await (
                    await marketplaceRequest(
                      origin,
                      "/my-submissions",
                      undefined,
                      credential,
                    )
                  ).json(),
                );
              })
            }
          >
            Refresh my submissions
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await invokeTauri("community_credential_clear", { origin });
                setCredential(null);
                setMine([]);
                setRecoveryCopy("");
                onChange(null);
              })
            }
          >
            Disconnect and clear saved credential
          </button>
          <ul>
            {mine.map((s) => (
              <li key={s.packageHash}>
                {s.title} · {s.version} · {s.status}
                {s.moderationNote ? " — " + s.moderationNote : ""}
                <label>Upload preview for {s.title}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) void run(async () => {
                    if (file.size > 5 * 1024 * 1024) throw Error('Preview exceeds 5 MiB.')
                    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choose a PNG, JPEG or WebP preview.')
                    await marketplaceRequest(origin, `/mods/${s.packageHash}/preview`, { mimeType: file.type, imageBase64: await readFileBase64(file) }, credential)
                    setProfileStatus('Preview uploaded. Refresh the marketplace to see approved content.')
                  })
                  event.target.value = ''
                }} /></label>
              </li>
            ))}
          </ul>
        </>
      )}
      {recoveryCopy && (
        <label>
          New recovery token — store privately
          <input
            readOnly
            type="password"
            value={recoveryCopy}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([recoveryCopy], { type: "text/plain" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "laap-community-recovery.txt";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Save recovery token
          </button>
        </label>
      )}
    </details>
  );
}
