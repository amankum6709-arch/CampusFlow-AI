const puppeteer = require("puppeteer-core");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.on("dialog", async (d) => { console.log("  [DIALOG]", d.message()); await d.accept(); });
  await page.goto(BASE + "/auth?mode=login", { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', "admin@demo.edu");
  await page.type('input[type="password"]', "password123");
  await page.click(".auth-submit");
  await sleep(3000);
  await page.goto(BASE + "/setup", { waitUntil: "networkidle0" });
  await sleep(3000);
  const readStep = () => page.evaluate(() => { const el = document.querySelector(".step-counter"); if (!el) return "?"; return el.textContent.trim(); });
  console.log("initial:", await readStep());
  for (let i = 0; i < 9; i++) {
    await page.evaluate(() => document.querySelector(".continue-button")?.click()).catch(() => {});
    await sleep(1200);
    console.log(`after click ${i + 1}:`, await readStep());
    const cont = await page.evaluate(() => Boolean(document.querySelector(".continue-button")));
    if (!cont) { console.log("no continue button"); break; }
  }
  await browser.close();
})();