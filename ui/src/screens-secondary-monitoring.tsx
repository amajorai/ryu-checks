import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Switch } from "@ryu/ui/components/switch.tsx";
import { useState } from "react";
import { ChecksCard, StatusBadge } from "./components.tsx";
import type { Schedule, TestList } from "./data.ts";
import { Glyph } from "./icons.tsx";
import { ScreenHeader } from "./screens-dashboard.tsx";

export function MonitoringPage({
	lists,
	onCreateSchedule,
	onRunSchedule,
	onToggleSchedule,
	schedules,
}: {
	lists: TestList[];
	onCreateSchedule(input: {
		name: string;
		listId: string;
		frequency: string;
	}): void;
	onRunSchedule(schedule: Schedule): void;
	onToggleSchedule(schedule: Schedule, active: boolean): void;
	schedules: Schedule[];
}) {
	const tl = useLiteralMessages();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("Nightly regression");
	const [frequency, setFrequency] = useState("Every night");
	const defaultList = lists[0];
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						disabled={!defaultList}
						onClick={() => setOpen((current) => !current)}
						size="default"
						type="button"
						variant="default"
					>
						<Glyph name="plus" />
						New schedule
					</Button>
				}
				description="Define node-local recurring verification and keep its last result visible."
				title="Monitoring"
			/>
			{open && defaultList ? (
				<ChecksCard className="inline-create">
					<CardContent>
						<div className="inline-create-content">
							<div>
								<h2>Keep a suite on a cadence</h2>
								<p>
									{tl("{name} will be used for this node-local schedule.", {
										name: defaultList.name,
									})}
								</p>
							</div>
							<div className="inline-create-form">
								<Input
									aria-label="Schedule name"
									onChange={(event) => setName(event.target.value)}
									value={name}
								/>
								<Input
									aria-label="Schedule frequency"
									onChange={(event) => setFrequency(event.target.value)}
									value={frequency}
								/>
								<Button
									disabled={!(name.trim() && frequency.trim())}
									onClick={() => {
										onCreateSchedule({
											frequency,
											listId: defaultList.id,
											name,
										});
										setOpen(false);
									}}
									size="default"
									type="button"
									variant="default"
								>
									Create schedule
								</Button>
							</div>
						</div>
					</CardContent>
				</ChecksCard>
			) : null}
			<div className="monitoring-banner">
				<div className="monitoring-art">
					<span />
					<span />
					<span />
					<span />
				</div>
				<div>
					<h2>Schedules stay close to the runner.</h2>
					<p>
						Ryu keeps the definition and last result in the sidecar. External CI
						and cloud grids are separate integrations, never implied by this
						local status.
					</p>
				</div>
				<div className="monitoring-banner-stat">
					<strong>
						{schedules.filter((schedule) => schedule.active).length}
					</strong>
					<span>active schedules</span>
				</div>
			</div>
			<div className="schedule-list">
				{schedules.map((schedule) => (
					<Card key={schedule.id}>
						<CardHeader>
							<div className="schedule-name">
								<span
									className={`schedule-icon ${schedule.active ? "active" : ""}`}
								>
									<Glyph name="clock" />
								</span>
								<div>
									<CardTitle>{schedule.name}</CardTitle>
									<CardDescription>
										{schedule.listName} · {schedule.frequency}
									</CardDescription>
								</div>
							</div>
							<CardAction>
								<Switch
									aria-label={tl("Activate {name}", { name: schedule.name })}
									checked={schedule.active}
									onCheckedChange={(checked) =>
										onToggleSchedule(schedule, checked)
									}
								/>
							</CardAction>
						</CardHeader>
						<CardContent>
							<div className="schedule-meta">
								<div>
									<span>Next run</span>
									<strong>{schedule.nextRun}</strong>
								</div>
								<div>
									<span>Last result</span>
									<StatusBadge status={schedule.lastResult} />
								</div>
								<div>
									<span>Boundary</span>
									<strong>Ryu node</strong>
								</div>
							</div>
							<div className="schedule-actions">
								<Button
									onClick={() => onRunSchedule(schedule)}
									size="sm"
									type="button"
									variant="outline"
								>
									Run now
								</Button>
								<span className="recording-note">Manual or local cadence</span>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
