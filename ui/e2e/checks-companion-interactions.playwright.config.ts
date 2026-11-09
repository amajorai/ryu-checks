import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const e2eDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(e2eDirectory, "..");
const baseURL = "http://127.0.0.1:4590";

export default defineConfig({
	testDir: e2eDirectory,
	testMatch: "checks-companion-interactions.spec.ts",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	outputDir: "/tmp/ryu-checks-companion-interactions-playwright-results",
	use: {
		...devices["Desktop Chrome"],
		baseURL,
		viewport: { width: 1440, height: 960 },
	},
	webServer: {
		command:
			"bun run vite --config=vite.config.ts --host 127.0.0.1 --port 4590 --strictPort",
		cwd: appRoot,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
