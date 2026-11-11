import {
  readContextId,
  saveContextId,
  resolveProfileContext,
} from "./completeContext";
import { useStudioTheme, ThemeBackground } from "./themeRuntime";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import App from "../../App";
const StudioWorkspace = lazy(() => import("./StudioWorkspace"));
export default function CompleteApp() {
  const theme = useStudioTheme();
  const [studio, setStudio] = useState(false);
  const [profile, setProfile] = useState<
    { id: string; name: string } | undefined
  >();
  const contextId = useRef<string | null>(readContextId());
  const profiles = useRef<{ id: string; name: string }[]>([]);
  const onProfilesChanged = useCallback(
    (rows: { id: string; name: string }[]) => {
      profiles.current = rows;
      const next = resolveProfileContext(contextId.current, rows);
      if (!next) {
        contextId.current = null;
        saveContextId(null);
      }
      setProfile(next);
    },
    [],
  );
  const selectProfile = useCallback(
    (next: { id: string; name: string } | undefined) => {
      contextId.current = next?.id ?? null;
      saveContextId(contextId.current);
      setProfile(next);
    },
    [],
  );
  const switched = useCallback(
    (id: string) => selectProfile(resolveProfileContext(id, profiles.current)),
    [selectProfile],
  );
  return (
    <>
      <App
        background={<ThemeBackground theme={theme} />}
        onShowAccounts={() => setStudio(false)}
        onProfilesChanged={onProfilesChanged}
        onProfileSwitched={switched}
        profileActions={(account) => (
          <button
            className="inspector-edit"
            type="button"
            onClick={() => {
              selectProfile({ id: account.id, name: account.name });
              setStudio(true);
            }}
          >
            Customization presets
          </button>
        )}
        navigation={
          <nav className="mode-nav" aria-label="Workspace">
            <button
              className="mode-pill"
              aria-pressed={!studio}
              onClick={() => setStudio(false)}
            >
              Accounts
            </button>
            <button
              className="mode-pill"
              aria-pressed={studio}
              onClick={() => {
                selectProfile(undefined);
                setStudio(true);
              }}
            >
              Studio
            </button>
            {studio && profile && (
              <span>Local preset context: {profile.name}</span>
            )}
          </nav>
        }
        studio={
          studio ? (
            <Suspense fallback={<p role="status">Opening Studio…</p>}>
              <StudioWorkspace
                key={profile?.id ?? "studio"}
                profile={profile}
              />
            </Suspense>
          ) : undefined
        }
      />
    </>
  );
}
