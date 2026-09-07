import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import type { RyuPickerSelection } from "@ryu/blocks/composer/runtime-picker";
import { Button } from "@ryu/ui/components/button.tsx";
import { useEffect, useState } from "react";
import { discoverRuntimeModels, loadRuntimeCatalog } from "./bridge.ts";
import {
	CHECKS_EXECUTION_AVAILABLE,
	CHECKS_PREVIEW_NOTICE,
	type Project,
	type Schedule,
	type TestCase,
	type TestList,
} from "./data.ts";

export { runtimeSelectionLabel } from "./runtime-selection.ts";

import { Glyph } from "./icons.tsx";
import type { Screen } from "./screen-model.ts";
import { CreateTestsPage } from "./screens-create-tests.tsx";
import { AllTestsPage, HomePage } from "./screens-dashboard.tsx";

import { ProjectDetailPage } from "./screens-project-detail.tsx";

import {
	MonitoringPage,
	SettingsPage,
	TestDetailPage,
	TestListsPage,
} from "./screens-secondary.tsx";

function App() {
	const [screen, setScreen] = useState<Screen>(() => {
		const requested =
			typeof window === "undefined" ? undefined : window.ryu?.context?.screen;
		switch (requested) {
			case "all-tests-ui":
				return { kind: "all-tests", filter: "UI" };
			case "all-tests-api":
				return { kind: "all-tests", filter: "API" };
			case "all-tests":
				return { kind: "all-tests", filter: "All" };
			case "create-tests":
				return { kind: "create-tests", step: 0 };
			case "test-lists":
				return { kind: "test-lists" };
			case "monitoring":
				return { kind: "monitoring" };
			case "settings-api-keys":
				return { kind: "settings", section: "api-keys" };
			case "settings-github":
				return { kind: "settings", section: "github" };
			default:
				return { kind: "home" };
		}
	});
	const [runtimeCatalog, setRuntimeCatalog] =
		useState<RyuCatalogSnapshot | null>(null);
	// This Companion is deliberately empty on launch. The old implementation
	// seeded a convincing workspace and treated timers/toasts as execution.
	const [projects, setProjects] = useState<Project[]>([]);
	const [tests, setTests] = useState<TestCase[]>([]);
	const [lists, setLists] = useState<TestList[]>([]);
	const [schedules] = useState<Schedule[]>([]);
	const [toast, setToast] = useState<string | null>(null);
	useEffect(() => {
		let mounted = true;
		void loadRuntimeCatalog().then((catalog) => {
			if (mounted) {
				setRuntimeCatalog(catalog);
			}
		});
		return () => {
			mounted = false;
		};
	}, []);
	useEffect(() => {
		if (!toast) {
			return;
		}
		const timeout = window.setTimeout(() => setToast(null), 2800);
		return () => window.clearTimeout(timeout);
	}, [toast]);
	const notify = (message: string) => setToast(message);
	const navigate = (next: Screen) => setScreen(next);
	const runProject = (id: string) => {
		void id;
		if (!CHECKS_EXECUTION_AVAILABLE) {
			notify(CHECKS_PREVIEW_NOTICE);
			return;
		}
	};
	const createProject = (draft: {
		name: string;
		type: "UI" | "API" | "Mixed";
		url: string;
		prd: string;
		testNames: string[];
		runtimeSelection?: RyuPickerSelection;
	}) => {
		const id = `project-${Date.now()}`;
		const names = draft.testNames;
		const project: Project = {
			id,
			name: draft.name.trim() || "Untitled project",
			description: draft.prd || "A new Ryu verification project.",
			type: draft.type,
			url: draft.url,
			tests: names.length,
			passed: 0,
			attention: 0,
			coverage: 0,
			status: "idle",
			lastRun: "Not run",
			nextRun: "Not scheduled",
			runtimeSelection: draft.runtimeSelection,
		};
		const generated: TestCase[] = names.map((name, index) => ({
			id: `${id}-test-${index + 1}`,
			projectId: id,
			name,
			description: `Planning case derived from the ${project.name} product brief.`,
			priority: index < 2 ? "High" : "Medium",
			type: draft.type === "API" ? "API" : "UI",
			status: "idle",
			feature: name.toLowerCase().includes("sign")
				? "Authentication"
				: name.toLowerCase().includes("search")
					? "Discovery"
					: "Recovery",
			steps: [
				"Open the target",
				"Perform the user action",
				"Verify the resulting state",
			],
			updated: "Just now",
		}));
		setProjects((current) => [project, ...current]);
		setTests((current) => [...generated, ...current]);
		navigate({ kind: "project", id, tab: "flow" });
		notify(`${project.name} added as an unexecuted plan.`);
	};
	const createList = (name: string) => {
		const list: TestList = {
			id: `list-${Date.now()}`,
			name,
			description: "A new local test collection.",
			status: "idle",
			uiTests: 0,
			apiTests: 0,
			lastRun: "Not run",
			nextRun: "Not scheduled",
		};
		setLists((current) => [list, ...current]);
		notify(`${name} created in this preview; it is not persisted or runnable.`);
	};
	const currentProject =
		screen.kind === "project"
			? projects.find((project) => project.id === screen.id)
			: screen.kind === "test"
				? projects.find((project) => project.id === screen.projectId)
				: undefined;
	const currentTest =
		screen.kind === "test"
			? tests.find((test) => test.id === screen.testId)
			: undefined;
	const title =
		screen.kind === "home"
			? "Home"
			: screen.kind === "all-tests"
				? "All Tests"
				: screen.kind === "create-tests"
					? "Create Tests"
					: screen.kind === "test-lists"
						? "Test Lists"
						: screen.kind === "monitoring"
							? "Monitoring"
							: screen.kind === "settings"
								? "Settings"
								: (currentProject?.name ?? "Tests");
	return (
		<div className="checks-app">
			<main className="app-main">
				<header className="app-topbar">
					<div className="topbar-context">
						<span className="topbar-dot" />
						<span>Ryu / Tests</span>
						<Glyph name="arrow-right" />
						<strong>{title}</strong>
					</div>
					<div className="topbar-actions">
						<Button
							aria-label="Notifications unavailable"
							className="topbar-icon"
							disabled
							type="button"
						>
							<Glyph name="notification" />
						</Button>
						<Button
							className="topbar-help"
							onClick={() => notify("Help is available in the Ryu docs")}
							type="button"
						>
							Help
						</Button>
						<span className="topbar-avatar">J</span>
					</div>
				</header>
				<div className="app-scroll">
					{screen.kind === "home" ? (
						<HomePage onNavigate={navigate} projects={projects} />
					) : null}
					{screen.kind === "all-tests" ? (
						<AllTestsPage
							onNavigate={navigate}
							onRunProject={runProject}
							projects={projects}
							screen={screen}
						/>
					) : null}
					{screen.kind === "create-tests" ? (
						<CreateTestsPage
							onCreate={createProject}
							onDiscoverModels={discoverRuntimeModels}
							onNavigate={navigate}
							runtimeCatalog={runtimeCatalog}
							step={screen.step}
						/>
					) : null}
					{screen.kind === "test-lists" ? (
						<TestListsPage
							lists={lists}
							onCreate={createList}
							onRun={() => notify(CHECKS_PREVIEW_NOTICE)}
						/>
					) : null}
					{screen.kind === "monitoring" ? (
						<MonitoringPage schedules={schedules} />
					) : null}
					{screen.kind === "settings" ? (
						<SettingsPage onNavigate={navigate} section={screen.section} />
					) : null}
					{screen.kind === "project" && currentProject ? (
						<ProjectDetailPage
							onNavigate={navigate}
							onRun={() => runProject(currentProject.id)}
							project={currentProject}
							tab={screen.tab}
							tests={tests}
						/>
					) : null}
					{screen.kind === "test" && currentProject && currentTest ? (
						<TestDetailPage
							onNavigate={navigate}
							panel={screen.panel}
							project={currentProject}
							test={currentTest}
						/>
					) : null}
				</div>
			</main>
			{toast ? (
				<div className="toast">
					<span className="toast-icon">
						<Glyph name="check" />
					</span>
					<span>{toast}</span>
				</div>
			) : null}
		</div>
	);
}

export { App };
