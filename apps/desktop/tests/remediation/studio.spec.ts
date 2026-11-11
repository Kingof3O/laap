import { test, expect } from "@playwright/test";

import { randomBytes } from "node:crypto";

import { once } from "node:events";

import { resolve } from "node:path";

import { MarketplaceStore } from "../../../community-api/src/marketplace.ts";

import { createCommunityServer } from "../../../community-api/src/party.ts";

import { packageFixture } from "../../../community-api/tests/packageFixture.ts";

const fixture = packageFixture();

const admin = randomBytes(32).toString("hex");

const themes = [
  {
    id: "velvet-amethyst",

    name: "Velvet Amethyst",

    isBuiltin: true,

    canvas: "#120d1a",

    panel: "#1d142b",

    surface: "#271b3a",

    accent: "#b388ff",

    accentHover: "#c8a5ff",

    textPrimary: "#f3e8ff",

    textSecondary: "#c3b5d2",

    border: "#3d2a58",

    fontFamily: "Manrope",

    opacity: 0.95,

    backgroundMediaPath: null,

    backgroundMediaType: null,

    animationSpeed: "normal",

    reducedMotion: false,

    performanceMode: false,
  },
];

let active = themes[0];

let credential: unknown = null;

let imported = 0;

const store = new MarketplaceStore(":memory:", { adminKey: admin });

const origins = new Set(["http://127.0.0.1:1423"]);

const relay = createCommunityServer({
  origins,

  marketplace: store.handler(origins),
});

test.beforeAll(async () => {
  relay.server.listen(4175, "127.0.0.1");

  await once(relay.server, "listening");
});

test.afterAll(async () => {
  await relay.close();

  store.close();
});

test.beforeEach(async ({ page }) => {
  await page.exposeFunction(
    "fixtureNative",

    async (command: string, args: any) => {
      if (command === "list_local_accounts" || command === "get_local_account")
        throw Error("Studio must not call vault IPC");

      if (command === "theme_get_active") return active;

      if (command === "theme_list") return themes;

      if (command === "theme_set_active") {
        active = themes.find((t) => t.id === args.id)!;

        return active;
      }

      if (command === "theme_reset_default") {
        active = themes[0];

        return active;
      }

      if (command === "theme_save_custom") {
        const t = {
          ...args.theme,

          id: args.theme.id || "custom-fixture",

          isBuiltin: false,
        };

        themes.push(t);

        return t;
      }

      if (command === "mod_list")
        return [
          {
            manifest: fixture.manifest,

            archiveBytes: fixture.archive.length,

            enabled: true,

            priority: 0,

            format: "GenericZip",
          },
        ];

      if (command === "mod_detect_conflicts") return [];

      if (command === "customization_preset_conflicts")
        return [
          {
            championId: "Ahri",
            accountId: null,
            queueMode: "classic",
            presetNames: ["Original A", "Original B"],
            skinIds: ["103000", "103001"],
          },
        ];

      if (command === "mod_get_package_data")
        return {
          sha256: fixture.packageHash,

          archiveBase64: fixture.archiveBase64,

          manifest: fixture.manifest,
        };

      if (command === "mod_import") {
        expect(args.manifest.sha256).toBe(fixture.packageHash);

        expect(args.archive).toBe(fixture.archiveBase64);

        imported++;

        return null;
      }

      if (command === "community_credential_load") return credential;

      if (command === "community_credential_save") {
        credential = args.credential;

        return null;
      }

      if (command === "community_credential_clear") {
        credential = null;

        return null;
      }

      if (command === "catalog_list")
        return { version: "16.22.1", locale: "en_US", data: [], cached: true };

      if (
        command === "customization_preset_list" ||
        command === "creator_list_projects"
      )
        return [];

      if (command === "plugin:event|listen") return 1;

      if (command === "window_is_maximized") return false;

      return null;
    },
  );

  await page.addInitScript(() => {
    localStorage.setItem("laap_auto_check_updates", "false");

    (window as any).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },

        currentWebview: { label: "main" },
      },

      transformCallback: () => 1,

      unregisterCallback: () => {},

      invoke: (command: string, args: any) =>
        (window as any).fixtureNative(command, args),
    };
  });
});

test("browser UI + real HTTP: creator registration, verified local bytes submission, human approval, download import acknowledgement", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Community", exact: true }).click();

  await page.getByText("Creator account / recovery", { exact: true }).click();

  await page

    .getByLabel("Display name", { exact: true })

    .fill("Original fixture creator");

  await page.getByRole("button", { name: "Create community identity" }).click();

  await expect(
    page.getByText("Creator: Original fixture creator", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Submit local package" }).click();

  await page

    .getByLabel("Redistributable local package", { exact: false })

    .selectOption(fixture.packageHash);

  await page

    .getByLabel("Mod title", { exact: true })

    .fill("Original fixture package");

  await page.getByLabel("Champion", { exact: true }).fill("Original artwork");

  await page

    .getByRole("checkbox", { name: /I have permission to distribute/ })

    .check();

  await page

    .getByRole("button", { name: "Submit package", exact: true })

    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "queued for human review" }),
  ).toBeVisible();

  expect(
    await (await fetch("http://127.0.0.1:4175/v1/marketplace/mods")).json(),
  ).toEqual([]);

  const approval = await fetch(
    "http://127.0.0.1:4175/v1/marketplace/admin/review/" + fixture.packageHash,

    {
      method: "POST",

      headers: { "Content-Type": "application/json", "X-Admin-Key": admin },

      body: JSON.stringify({
        action: "approve",

        note: "Generated original fixture reviewed for integration test",
      }),
    },
  );

  expect(approval.status).toBe(200);

  await page.getByRole("button", { name: "Refresh", exact: true }).click();

  await expect(
    page.getByText("Original fixture package · v1.0.0", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Get package", exact: true }).click();

  await page

    .getByRole("button", { name: "Download & verify", exact: true })

    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "Package verified and added" }),
  ).toBeVisible();

  expect(imported).toBe(1);

  await page.setViewportSize({ width: 1160, height: 760 });

  await page.screenshot({
    path: resolve(
      "../../docs/implementation-tracking/screenshots/marketplace-browser-http.png",
    ),

    fullPage: true,
  });
});

test("theme contract restores active colors after navigation and restart; fonts and reduced motion render", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Themes", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "LAAP theme workshop" }),
  ).toBeVisible();

  await page

    .getByLabel("Name", { exact: true })

    .fill("Original fixture palette");

  await page.getByLabel("accent", { exact: true }).fill("#a4c5f9");

  await page.getByLabel("Reduce motion", { exact: false }).check();

  await page

    .getByRole("button", { name: "Save and apply", exact: true })

    .click();

  await expect

    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--accent-primary")

          .trim(),
      ),
    )

    .toBe("#a4c5f9");

  await page.getByRole("button", { name: "Party", exact: true }).click();

  await page.reload();

  await page.getByRole("button", { name: "Themes", exact: true }).click();

  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Original fixture palette",
  );

  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("studio-reduced-motion"),
    ),
  ).toBe(true);

  await page.evaluate(() => document.fonts.ready);

  expect(await page.evaluate(() => document.fonts.check("14px Manrope"))).toBe(
    true,
  );

  for (const [width, height] of [
    [960, 640],

    [1160, 760],

    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });

    await page.screenshot({
      path: resolve(
        `../../docs/implementation-tracking/screenshots/theme-browser-${width}.png`,
      ),

      fullPage: true,
    });

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("native-shaped preset conflict reports render without a contract crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await expect(
    page.getByText(/Ahri.*classic: Original A vs Original B/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
