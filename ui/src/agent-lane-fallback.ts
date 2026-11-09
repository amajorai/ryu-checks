import type { LiteralMessage } from "@ryu/i18n/react";

/**
 * The notice shown when the agent lane fails and a run falls back to live HTTP
 * evidence. Lane errors are English literals (`bridge.ts`) or host text, so the
 * message is translated before it is spliced into the translated sentence;
 * host text without a catalog entry is shown as sent.
 */
export function agentLaneFallbackNotice(
	error: unknown,
	tl: LiteralMessage
): string {
	if (error instanceof Error && error.message) {
		return tl("{message} Falling back to live HTTP evidence.", {
			message: tl(error.message),
		});
	}
	return tl("Agent lane unavailable; falling back to live HTTP evidence.");
}
