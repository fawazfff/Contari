import { test, expect, type Page } from "@playwright/test";

const walletAddress = "otl_esm_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
let lockerRow: Record<string, unknown> | null = null;
let secureKey = "";

async function installWallet(page: Page, address = walletAddress) {
  await page.addInitScript((account) => {
    (window as any).__testAccount = localStorage.getItem("testWallet") || account;
    (window as any).__walletCalls = [];
    (window as any).tari = { isTariWallet: true,
      request: async ({ method, params }: { method: string; params?: Record<string, unknown> }) => {
        (window as any).__walletCalls.push(method);
        if (method === "tari_requestAccounts") return [(window as any).__testAccount || account];
        if (method === "tari_getNetwork") return "esmeralda";
        if (method === "tari_getCapabilities") return { walletOwnershipProof: true, transactionResultLookup: localStorage.getItem("testTransactionLookup") === "true" };
        if (method === "tari_signAndSubmitTransaction") return { transactionId: "a".repeat(64) };
        if (method === "tari_getTransactionResult") return { Finalized: { final_decision: "Commit" } };
        if (method === "tari_signWalletOwnershipChallenge") return { walletAddress: (window as any).__testAccount, signature: "test-signature", publicNonce: "test-nonce", challenge: params?.challenge };
        if (method === "tari_disconnect") return null;
        throw new Error("Unexpected wallet method: " + method);
      },
    };
  }, address);
}

async function mockSecureFunction(page: Page) {
  secureKey = "";
  await page.route("**/functions/v1/contari-secure", async (route) => {
    const body = route.request().postDataJSON() as Record<string, any>;
    if (body.action === "challenge") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "challenge-" + body.purpose, challenge: "contari:" + body.purpose + ":" + body.lockerId + ":test", expires_at: new Date(Date.now() + 300000).toISOString() }) });
    } else if (body.action === "read") {
      const row = lockerRow && lockerRow.id === body.lockerId ? { ...lockerRow, allowed_wallets: undefined } : null;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locker: row }) });
    } else if (body.action === "list") {
      const rows = lockerRow && String(lockerRow.creator_wallet).toLowerCase() === String(body.walletAddress).toLowerCase() ? [lockerRow] : [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lockers: rows }) });
    } else if (body.action === "create") {
      secureKey = body.key;
      lockerRow = { id: body.id, title: body.title, description: body.description, ciphertext: body.ciphertext, iv: body.iv, gate: body.gate, allowed_wallets: body.allowedWallets, creator_wallet: body.walletAddress, creator_network: body.network, key_version: 2, ootle_component_address: body.componentAddress || null, created_at: new Date().toISOString() };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: body.id, created: true }) });
    } else if (body.action === "unlock") {
      const isCreator = lockerRow && String(lockerRow.creator_wallet).toLowerCase() === String(body.walletAddress).toLowerCase();
      const isAllowed = lockerRow && (lockerRow.gate === "wallet" || (Array.isArray(lockerRow.allowed_wallets) && lockerRow.allowed_wallets.some((a: string) => a.toLowerCase() === String(body.walletAddress).toLowerCase())));
      const componentGateMissing = !!lockerRow?.ootle_component_address && String(body.transactionId || "") !== "a".repeat(64);
      if (componentGateMissing) {
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "This locker requires a finalized Ootle claim transaction." }) });
      } else if (!isCreator && !isAllowed) {
        await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "This Tari wallet is not allowed to open this locker." }) });
      } else {
        await route.fulfill({ status: secureKey ? 200 : 404, contentType: "application/json", body: JSON.stringify(secureKey ? { key: secureKey } : { error: "missing key" }) });
      }
    } else {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "unknown action" }) });
    }
  });
}

async function mockSupabase(page: Page) {
  lockerRow = null;
  await page.route("**/rest/v1/contari_lockers**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      lockerRow = JSON.parse(request.postData() || "{}");
      await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      return;
    }
    if (request.method() === "GET") {
      const idFilter = new URL(request.url()).searchParams.get("id");
      const id = idFilter?.replace(/^eq\./, "");
      if (id && lockerRow && lockerRow.id === id) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          ...lockerRow,
          created_at: new Date().toISOString(),
          creator_wallet: lockerRow.creator_wallet,
        }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
  await mockSecureFunction(page);
});

test("landing navigation and main routes render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /share a link/i })).toBeVisible();
  await page.getByRole("link", { name: /see how it works/i }).click();
  await expect(page.getByRole("heading", { name: /from private note/i })).toBeVisible();
  await page.getByRole("link", { name: /try the demo/i }).click();
  await expect(page.getByRole("heading", { name: /create a locker/i })).toBeVisible();
  await page.getByRole("link", { name: /back to workspace/i }).click();
  await expect(page.getByRole("heading", { name: /your lockers/i })).toBeVisible();
});

test("create form requires a wallet and validates empty content", async ({ page }) => {
  await page.goto("/app/create");
  await expect(page.getByRole("button", { name: /connect wallet first/i })).toBeDisabled();
  await expect(page.getByText(/connect a tari wallet to continue/i)).toBeVisible();
  await installWallet(page);
  await page.reload();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page.getByText(/add a title and the content you want to lock/i)).toBeVisible();
});

test("settings reject malformed component addresses and save a valid-shaped value", async ({ page }) => {
  await page.goto("/app/settings");
  await page.getByLabel("Registry component address").fill("not-a-component");
  await page.getByRole("button", { name: /save component address/i }).click();
  await expect(page.getByText(/enter a component address/i)).toBeVisible();
  await page.getByLabel("Registry component address").fill("component_" + "a".repeat(64));
  await page.getByRole("button", { name: /save component address/i }).click();
  await expect(page.getByText(/component address saved/i)).toBeVisible();
});

test("wallet connects and can be disconnected from settings", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: /otl_esm_01/ })).toBeVisible();
  await page.getByRole("button", { name: /disconnect/i }).click();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
});

test("creates an encrypted locker and opens it with the keyless locker link", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: /otl_esm_01/ })).toBeVisible();
  await page.getByLabel("Locker title").fill("Launch notes");
  await page.getByLabel("Short description").fill("For the team");
  await page.getByLabel("Your content").fill("The private launch details are here.");
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\/[a-f0-9]+$/);
  await expect(page.getByRole("heading", { name: "Launch notes" })).toBeVisible();
  await page.getByRole("button", { name: /connect & unlock/i }).click();
  await expect(page.getByText("The private launch details are here.")).toBeVisible();
  await expect(page.getByText(/tari wallet verified/i)).toBeVisible();
});

test("selected-wallet gate blocks an address that is not on the list", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByLabel("Locker title").fill("Selected only");
  await page.getByLabel("Your content").fill("Restricted note");
  await page.getByRole("button", { name: /selected wallets/i }).click();
  await page.getByLabel("Allowed wallet addresses").fill("otl_esm_" + "f".repeat(64));
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  await page.evaluate(() => localStorage.setItem("testWallet", "otl_esm_" + "e".repeat(64)));
  await page.reload();
  await page.getByRole("button", { name: /connect & unlock/i }).click();
  await expect(page.getByText(/not allowed to open this locker/i)).toBeVisible();
});

test("copy-link action reports success when clipboard is available", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByLabel("Locker title").fill("Copy check");
  await page.getByLabel("Your content").fill("Copy this link");
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  await page.getByRole("button", { name: /copy locker link/i }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
});

test("workspace sidebar links open overview, library, and settings", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("link", { name: /my lockers/i }).click();
  await expect(page.getByRole("heading", { name: /my lockers/i })).toBeVisible();
  await page.getByRole("link", { name: /wallet & network/i }).click();
  await expect(page.getByRole("heading", { name: /wallet & network/i })).toBeVisible();
  await page.getByRole("link", { name: /overview/i }).click();
  await expect(page.getByRole("heading", { name: /your lockers/i })).toBeVisible();
});

test("mobile sidebar opens and closes after navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page.getByRole("button", { name: /open navigation menu/i }).click();
  await expect(page.getByRole("link", { name: /my lockers/i })).toBeVisible();
  await page.getByRole("link", { name: /my lockers/i }).click();
  await expect(page.getByRole("heading", { name: /my lockers/i })).toBeVisible();
});

test("configured Ootle unlock stops before submitting when result lookup is unsupported", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app/create");
  await page.evaluate(() => {
    localStorage.setItem("contari_component", "component_" + "a".repeat(64));
    localStorage.setItem("testTransactionLookup", "true");
  });
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByLabel("Locker title").fill("Finality guard");
  await page.getByLabel("Your content").fill("Do not open without a verified claim");
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  await page.evaluate(() => localStorage.setItem("testTransactionLookup", "false"));
  await page.reload();
  await page.getByRole("button", { name: /connect & unlock/i }).click();
  await expect(page.getByText(/no claim was submitted/i)).toBeVisible();
  const submitted = await page.evaluate(() => (window as any).__walletCalls.includes("tari_signAndSubmitTransaction"));
  expect(submitted).toBe(false);
});

test("server denies an allowlist bypass even if browser storage is tampered with", async ({ page }) => {
  const recipient = "otl_esm_" + "1".repeat(64);
  const attacker = "otl_esm_" + "2".repeat(64);
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByLabel("Locker title").fill("Private team note");
  await page.getByLabel("Your content").fill("Only the selected wallet can read this.");
  await page.getByRole("button", { name: /selected wallets/i }).click();
  await page.getByLabel("Allowed wallet addresses").fill(recipient);
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  await page.evaluate((value) => {
    const rows = JSON.parse(localStorage.getItem("contari_lockers_v1") || "[]");
    rows[0].allowedWallets = [value];
    localStorage.setItem("contari_lockers_v1", JSON.stringify(rows));
    localStorage.setItem("testWallet", value);
    (window as any).__testAccount = value;
  }, attacker);
  await page.reload();
  await page.getByRole("button", { name: /connect & unlock/i }).click();
  await expect(page.getByText(/not allowed to open this locker/i)).toBeVisible();
});

test("Ootle-configured locker sends its claim transaction to the key service", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("contari_component", "component_" + "a".repeat(64));
    localStorage.setItem("testTransactionLookup", "true");
  });
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByLabel("Locker title").fill("Chain-checked note");
  await page.getByLabel("Your content").fill("This requires an Ootle claim.");
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  await expect(page.getByRole("heading", { name: "Chain-checked note" })).toBeVisible();
  await page.getByRole("button", { name: /connect & unlock/i }).click();
  await expect(page.getByText(/ootle claim independently verified/i)).toBeVisible();
  const calls = await page.evaluate(() => (window as any).__walletCalls);
  expect(calls.filter((name: string) => name === "tari_signAndSubmitTransaction").length).toBe(2);
});

test("workspace library uses a signed wallet challenge to list owned lockers", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByLabel("Locker title").fill("My saved locker");
  await page.getByLabel("Your content").fill("Private content stays in the key vault.");
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  const proofsBeforeList = await page.evaluate(() => (window as any).__walletCalls.filter((name: string) => name === "tari_signWalletOwnershipChallenge").length);
  await page.getByRole("link", { name: /back to workspace/i }).click();
  await expect(page.getByRole("heading", { name: /your lockers/i })).toBeVisible();
  await expect(page.getByText("My saved locker")).toBeVisible();
  const proofsAfterList = await page.evaluate(() => (window as any).__walletCalls.filter((name: string) => name === "tari_signWalletOwnershipChallenge").length);
  expect(proofsAfterList).toBeGreaterThan(proofsBeforeList);
});
