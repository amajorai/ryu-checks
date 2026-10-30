import { useLiteralMessages } from "@ryu/i18n/react";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import {
	createSchedule as createScheduleRequest,
	runSchedule as runScheduleRequest,
	toggleSchedule,
} from "./bridge.ts";
import type { Schedule, TestRun } from "./data.ts";

export function useChecksScheduleActions(
	notify: (message: string) => void,
	setSchedules: Dispatch<SetStateAction<Schedule[]>>,
	syncProjectFromRun: (run: TestRun) => void
) {
	const tl = useLiteralMessages();
	const createSchedule = useCallback(
		async (input: { name: string; listId: string; frequency: string }) => {
			try {
				const schedule = await createScheduleRequest(input);
				setSchedules((current) => [schedule, ...current]);
				notify("The schedule is saved on this node.");
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The schedule could not be saved."
				);
			}
		},
		[notify]
	);

	const setScheduleActive = useCallback(
		async (schedule: Schedule, active: boolean) => {
			try {
				const updated = await toggleSchedule(schedule.id, active);
				setSchedules((current) =>
					current.map((item) => (item.id === updated.id ? updated : item))
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The schedule could not be updated."
				);
			}
		},
		[notify]
	);

	const runSchedule = useCallback(
		async (schedule: Schedule) => {
			try {
				const result = await runScheduleRequest(schedule.id);
				result.runs.forEach(syncProjectFromRun);
				setSchedules((current) =>
					current.map((item) =>
						item.id === result.schedule.id ? result.schedule : item
					)
				);
				notify(
					tl(
						"{name} finished with {count, plural, one {{countLabel} attention run} other {{countLabel} attention runs}}.",
						{
							count: result.runs.filter((run) => run.failed > 0).length,
							countLabel: String(
								result.runs.filter((run) => run.failed > 0).length
							),
							name: schedule.name,
						}
					)
				);
			} catch (error) {
				notify(
					error instanceof Error ? error.message : "The schedule could not run."
				);
			}
		},
		[notify, syncProjectFromRun, tl]
	);

	return { createSchedule, runSchedule, setScheduleActive };
}
