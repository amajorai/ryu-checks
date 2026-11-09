import { expect, test } from "bun:test";
import { formatMessage } from "@ryu/i18n/core";
import type { LiteralMessage } from "@ryu/i18n/react";
import { agentLaneFallbackNotice } from "./agent-lane-fallback.ts";

const UNAVAILABLE = "The selected Ryu agent lane is unavailable.";
const DE: Record<string, string> = {
	[UNAVAILABLE]: "Die ausgewählte Ryu-Agentenspur ist nicht verfügbar.",
	"{message} Falling back to live HTTP evidence.":
		"{message} Es werden stattdessen Live-HTTP-Belege verwendet.",
	"Agent lane unavailable; falling back to live HTTP evidence.":
		"Agentenspur nicht verfügbar; es werden Live-HTTP-Belege verwendet.",
};
const german: LiteralMessage = (source, values = {}) =>
	formatMessage(DE[source] ?? source, values, "de");
const english: LiteralMessage = (source, values = {}) =>
	formatMessage(source, values, "en");

test("a known lane error reads as one German notice", () => {
	expect(agentLaneFallbackNotice(new Error(UNAVAILABLE), german)).toBe(
		"Die ausgewählte Ryu-Agentenspur ist nicht verfügbar. Es werden stattdessen Live-HTTP-Belege verwendet."
	);
});

test("host text without a catalog entry is kept as sent", () => {
	expect(agentLaneFallbackNotice(new Error("agent 7 timed out"), german)).toBe(
		"agent 7 timed out Es werden stattdessen Live-HTTP-Belege verwendet."
	);
});

test("a non-Error rejection uses the whole fallback sentence", () => {
	expect(agentLaneFallbackNotice("boom", german)).toBe(
		"Agentenspur nicht verfügbar; es werden Live-HTTP-Belege verwendet."
	);
	expect(agentLaneFallbackNotice(undefined, english)).toBe(
		"Agent lane unavailable; falling back to live HTTP evidence."
	);
});
