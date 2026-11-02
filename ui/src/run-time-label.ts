import {
	activeLocale,
	formatRelativeTime,
	translate as tl,
} from "@ryu/i18n/core";
import { formatDateTime } from "@ryu/ui/lib/timezone.ts";
import type { Project, TestRun } from "./data.ts";

/** `2026-11-01 15:04 UTC`, the backend's English schedule and evidence stamp. */
const BACKEND_UTC_TIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/u;
const DATE_AND_TIME: Intl.DateTimeFormatOptions = {
	dateStyle: "medium",
	timeStyle: "short",
};

function validDate(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A run-time string from the backend in the viewer's language. The backend
 * keeps English labels ("Not run", "Not scheduled", "Just now", a UTC stamp)
 * for MCP callers; the UI shows them translated, and a UTC stamp as a local
 * date and time. Anything else (already display text) is shown as is.
 */
export function runTimeText(value: string): string {
	switch (value) {
		case "Not run":
			return tl("Not run");
		case "Not scheduled":
			return tl("Not scheduled");
		case "Just now":
			return tl("Just now");
		default:
			break;
	}
	const stamp = BACKEND_UTC_TIME.exec(value);
	const date = stamp ? validDate(`${stamp[1]}T${stamp[2]}:00Z`) : null;
	return date ? formatDateTime(date, DATE_AND_TIME) : value;
}

/** When something last ran: relative to now when the time is known. */
export function lastRunText(
	value: string,
	at?: string | null,
	now = Date.now()
): string {
	const date = value === "Not run" ? null : validDate(at);
	return date
		? formatRelativeTime(activeLocale(), date, { now })
		: runTimeText(value);
}

/** When something runs next: a local date and time when it is known. */
export function nextRunText(value: string, at?: string | null): string {
	const date = validDate(at);
	return date ? formatDateTime(date, DATE_AND_TIME) : runTimeText(value);
}

/**
 * When a project last ran: its latest run's finish time (the backend stores
 * only "Just now" in `lastRun`), else its last update.
 */
export function projectLastRunAt(
	project: Pick<Project, "lastRun" | "latestRunId" | "updatedAt">,
	runs: readonly Pick<TestRun, "finishedAt" | "id">[] = []
): string | null {
	if (project.lastRun !== "Just now") {
		return null;
	}
	const latest = runs.find((run) => run.id === project.latestRunId);
	return latest?.finishedAt || project.updatedAt || null;
}
