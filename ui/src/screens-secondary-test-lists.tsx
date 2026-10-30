import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { Card, CardContent } from "@ryu/ui/components/card.tsx";
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { useState } from "react";
import { ChecksCard, StatusBadge } from "./components.tsx";
import type { TestCase, TestList } from "./data.ts";
import { Glyph } from "./icons.tsx";
import { MetricCard, ScreenHeader } from "./screens-dashboard.tsx";

export function TestListsPage({
	lists,
	onCreate,
	onRun,
	onUpdateList,
	tests,
}: {
	lists: TestList[];
	onCreate(name: string): void;
	onRun(list: TestList): void;
	onUpdateList(listId: string, testIds: string[]): void;
	tests: TestCase[];
}) {
	const tl = useLiteralMessages();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [editingListId, setEditingListId] = useState<string | null>(null);
	const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
	const beginEdit = (list: TestList) => {
		setEditingListId(list.id);
		setSelectedTestIds(list.testIds ?? tests.map((test) => test.id));
	};
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						onClick={() => setOpen((value) => !value)}
						size="default"
						type="button"
						variant="default"
					>
						<Glyph name="plus" />
						New list
					</Button>
				}
				description="Group live verification cases together for repeatable local runs."
				title="Test Lists"
			/>
			{open ? (
				<ChecksCard className="inline-create">
					<CardContent>
						<div className="inline-create-content">
							<div>
								<h2>Give this collection a job</h2>
								<p>
									Use a name your team will recognize in a release note or
									schedule.
								</p>
							</div>
							<div className="inline-create-form">
								<Input
									aria-label="Test list name"
									onChange={(event) => setName(event.target.value)}
									placeholder="e.g. Release gate"
									value={name}
								/>
								<Button
									disabled={name.trim().length === 0}
									onClick={() => {
										onCreate(name.trim());
										setName("");
										setOpen(false);
									}}
									size="default"
									type="button"
									variant="default"
								>
									Create list
								</Button>
							</div>
						</div>
					</CardContent>
				</ChecksCard>
			) : null}
			<div className="list-summary-grid">
				<MetricCard
					accent="green"
					helper="Collections ready to run"
					icon="package"
					label="Test lists"
					value={String(lists.length)}
				/>
				<MetricCard
					accent="blue"
					helper="UI and API coverage"
					icon="test"
					label="Tests grouped"
					value={String(
						lists.reduce(
							(total, list) => total + list.uiTests + list.apiTests,
							0
						)
					)}
				/>
				<MetricCard
					accent="amber"
					helper="Node-local collections"
					icon="clock"
					label="Scheduled"
					value="0"
				/>
			</div>
			<Card>
				<div className="data-table-header">
					<span>Name</span>
					<span>Last execution</span>
					<span>Test cases</span>
					<span>Status</span>
					<span />
				</div>
				{lists.map((list) => (
					<div className="data-table-row" key={list.id}>
						<div className="data-primary">
							<span className="list-icon">
								<Glyph name="package" />
							</span>
							<span>
								<strong>{list.name}</strong>
								<small>{list.description}</small>
							</span>
						</div>
						<span>{list.lastRun}</span>
						<span>
							<strong>{list.uiTests + list.apiTests}</strong>
							<small>
								{tl("{uiTests} UI · {apiTests} API", {
									uiTests: String(list.uiTests),
									apiTests: String(list.apiTests),
								})}
							</small>
						</span>
						<StatusBadge status={list.status} />
						<div className="row-actions">
							<Button
								onClick={() => onRun(list)}
								size="sm"
								type="button"
								variant="outline"
							>
								Run now
							</Button>
							<Button
								onClick={() =>
									editingListId === list.id
										? (onUpdateList(list.id, selectedTestIds),
											setEditingListId(null))
										: beginEdit(list)
								}
								size="sm"
								type="button"
								variant="ghost"
							>
								{editingListId === list.id ? "Save cases" : "Edit cases"}
							</Button>
						</div>
						{editingListId === list.id ? (
							<div className="list-membership-editor">
								<strong>Test cases in this collection</strong>
								{tests.map((test) => (
									<label className="list-membership-option" key={test.id}>
										<Checkbox
											checked={selectedTestIds.includes(test.id)}
											onCheckedChange={(checked) =>
												setSelectedTestIds((current) =>
													checked
														? [...new Set([...current, test.id])]
														: current.filter((id) => id !== test.id)
												)
											}
										/>
										<span>{test.name}</span>
									</label>
								))}
							</div>
						) : null}
					</div>
				))}
			</Card>
		</div>
	);
}
