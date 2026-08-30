export type ProjectTab =
	| "flow"
	| "exploration"
	| "tests"
	| "actions"
	| "report";
export type SettingsSection = "api-keys" | "github";
export type TestFilter = "All" | "UI" | "API";
export type Screen =
	| { kind: "home" }
	| { kind: "all-tests"; filter: TestFilter }
	| { kind: "test-lists" }
	| { kind: "monitoring" }
	| { kind: "settings"; section: SettingsSection }
	| { kind: "create-tests"; step: number }
	| { kind: "project"; id: string; tab: ProjectTab }
	| {
			kind: "test";
			projectId: string;
			testId: string;
			panel: "preview" | "code";
	  };

export function screenKey(screen: Screen): string {
	switch (screen.kind) {
		case "home":
			return "home";
		case "all-tests":
			return `all-tests:${screen.filter}`;
		case "test-lists":
			return "test-lists";
		case "monitoring":
			return "monitoring";
		case "settings":
			return `settings:${screen.section}`;
		case "create-tests":
			return `create-tests:${screen.step}`;
		case "project":
			return `project:${screen.id}:${screen.tab}`;
		case "test":
			return `test:${screen.projectId}:${screen.testId}:${screen.panel}`;
	}
}
