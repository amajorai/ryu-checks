import { describe, expect, it } from "bun:test";
import {
	lastRunText,
	nextRunText,
	projectLastRunAt,
	runTimeText,
} from "./run-time-label.ts";

describe("run time labels", () => {
	it("keeps the backend's English labels out of translated sentences", () => {
		expect(runTimeText("Not run")).toBe("Not run");
		expect(runTimeText("Not scheduled")).toBe("Not scheduled");
		expect(runTimeText("Just now")).toBe("Just now");
		expect(runTimeText("Tonight, 11:30 PM")).toBe("Tonight, 11:30 PM");
	});

	it("shows a backend UTC stamp as a local date and time", () => {
		const shown = runTimeText("2026-11-01 15:04 UTC");
		expect(shown).not.toContain("UTC");
		expect(shown).toContain("2026");
		expect(nextRunText("2026-11-01 15:04 UTC", "bad")).toBe(shown);
	});

	it("prefers the stored timestamps", () => {
		const now = Date.parse("2026-11-01T15:04:00Z");
		expect(lastRunText("Just now", "2026-11-01T14:04:00Z", now)).toBe(
			"1 hour ago"
		);
		expect(lastRunText("Not run", "2026-11-01T14:04:00Z", now)).toBe("Not run");
		expect(nextRunText("Not scheduled", "2026-11-02T08:00:00Z")).toContain(
			"2026"
		);
	});

	it("finds when a project last ran from its latest run", () => {
		const project = {
			lastRun: "Just now",
			latestRunId: "run-2",
			updatedAt: "2026-10-30T00:00:00Z",
		};
		const runs = [
			{ finishedAt: "2026-10-31T00:00:00Z", id: "run-1" },
			{ finishedAt: "2026-11-01T00:00:00Z", id: "run-2" },
		];
		expect(projectLastRunAt(project, runs)).toBe("2026-11-01T00:00:00Z");
		expect(projectLastRunAt(project)).toBe("2026-10-30T00:00:00Z");
		expect(projectLastRunAt({ ...project, lastRun: "Not run" }, runs)).toBe(
			null
		);
	});
});
