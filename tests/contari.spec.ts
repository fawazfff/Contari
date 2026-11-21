import { test, expect, type Page } from "@playwright/test";

const walletAddress = "otl_esm_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
let lockerRow: Record<string, unknown> | null = null;

async function installWallet(page: Page, address = walletAddress) {
  await page.addInitScript((account) => {
    (window as any).tari = {
      request: async ({ method, params }: { method: string; params?: Record<string, unknown> }) => {
        if (method === "tari_requestAccounts") return [account];
        if (method === "tari_getNetwork") return "esmeralda";
        if (method === "tari_getCapabilities") return { walletOwnershipProof: true, transactionResultLookup: false };
        if (method === "tari_signWalletOwnershipChallenge") return { walletAddress: account, signature: "test-signature", publicNonce: "test-nonce", challenge: params?.challenge };
        if (method === "tari_disconnect") return null;
        throw new Error("Unexpected wallet method: " + method);
      },
    };
  }, address);
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
      const id = new URL(request.url()).searchParams.get("id");
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
  await page.getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.getByText(walletAddress.slice(0, 10))).toBeVisible();
  await page.getByRole("button", { name: /disconnect/i }).click();
  await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible();
});

test("creates an encrypted locker and opens it with the complete preview link", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.getByText(walletAddress.slice(0, 10))).toBeVisible();
  await page.getByLabel("Locker title").fill("Launch notes");
  await page.getByLabel("Short description").fill("For the team");
  await page.getByLabel("Your content").fill("The private launch details are here.");
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\/[a-f0-9]+#key=/);
  await expect(page.getByRole("heading", { name: "Launch notes" })).toBeVisible();
  await page.getByRole("button", { name: /connect & unlock/i }).click();
  await expect(page.getByText("The private launch details are here.")).toBeVisible();
  await expect(page.getByText(/wallet challenge received/i)).toBeVisible();
});

test("selected-wallet gate blocks an address that is not on the list", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: /connect wallet/i }).click();
  await page.getByLabel("Locker title").fill("Selected only");
  await page.getByLabel("Your content").fill("Restricted note");
  await page.getByRole("button", { name: /selected wallets/i }).click();
  await page.getByLabel("Allowed wallet addresses").fill("otl_esm_" + "f".repeat(64));
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  await page.getByRole("button", { name: /connect & unlock/i }).click();
  await expect(page.getByText(/not on the access list/i)).toBeVisible();
});

test("copy-link action reports success when clipboard is available", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installWallet(page);
  await page.goto("/app/create");
  await page.getByRole("button", { name: /connect wallet/i }).click();
  await page.getByLabel("Locker title").fill("Copy check");
  await page.getByLabel("Your content").fill("Copy this link");
  await page.getByRole("button", { name: /encrypt & create locker/i }).click();
  await expect(page).toHaveURL(/\/l\//);
  await page.getByRole("button", { name: /copy complete link/i }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
});
