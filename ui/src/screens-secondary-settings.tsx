import { RyuAppList, RyuAppListItem } from "@ryu/blocks/companion/app-ui";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { StatusBadge } from "./components.tsx";
import { Glyph, type IconName } from "./icons.tsx";
import type { Screen, SettingsSection } from "./screen-model.ts";
import { ScreenHeader } from "./screens-dashboard.tsx";

export function SettingsPage({
	section,
	onNavigate,
}: {
	section: SettingsSection;
	onNavigate(screen: Screen): void;
}) {
	const sections: Array<{
		id: SettingsSection;
		label: string;
		icon: IconName;
		detail: string;
	}> = [
		{
			id: "api-keys",
			label: "API Keys",
			icon: "key",
			detail: "MCP and local tooling",
		},
		{
			id: "github",
			label: "GitHub App",
			icon: "github",
			detail: "PR verification",
		},
		{
			id: "capabilities",
			label: "Capabilities",
			icon: "activity",
			detail: "Parity boundary",
		},
	];
	return (
		<div className="page-stack">
			<ScreenHeader
				description="Ryu keeps configuration close to the node that owns the work."
				title="Workspace settings"
			/>
			<div className="settings-layout">
				<div className="settings-nav">
					<RyuAppList aria-label="Settings sections">
						{sections.map((item) => (
							<RyuAppListItem
								accessories={<Glyph name="arrow-right" />}
								icon={<Glyph name={item.icon} />}
								key={item.id}
								onClick={() =>
									onNavigate({ kind: "settings", section: item.id })
								}
								selected={section === item.id}
								subtitle={item.detail}
								title={item.label}
							/>
						))}
					</RyuAppList>
				</div>
				<div className="settings-content">
					{section === "api-keys" ? (
						<Card>
							<CardHeader>
								<div>
									<CardTitle>API Keys</CardTitle>
									<CardDescription>
										External API-key storage is outside Checks. Use Ryu grants
										or the provider-owned secret boundary.
									</CardDescription>
								</div>
								<CardAction>
									<StatusBadge status="idle" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="key-callout">
									<span className="key-callout-icon">
										<Glyph name="key" />
									</span>
									<div>
										<strong>Ryu boundary</strong>
										<p>
											Checks never prints or persists a provider key. The live
											runner uses the target URL and the granted node
											capability.
										</p>
									</div>
								</div>
								<p className="settings-note">
									<Glyph name="key" />
									No third-party credential is required for the built-in
									live-http lane.
								</p>
							</CardContent>
						</Card>
					) : null}
					{section === "github" ? (
						<Card>
							<CardHeader>
								<div>
									<CardTitle>GitHub App</CardTitle>
									<CardDescription>
										GitHub merge gates remain an external CI integration.
									</CardDescription>
								</div>
								<CardAction>
									<StatusBadge status="idle" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="github-connect">
									<span className="github-mark">
										<Glyph name="github" />
									</span>
									<div>
										<h2>External integration</h2>
										<p>
											GitHub authorization and workflow editing stay outside
											Checks. The CI guide covers the supported node-local CLI
											and authenticated Checks-tool paths.
										</p>
									</div>
									<Button
										disabled={!window.ryu?.ui?.openExternal}
										onClick={() =>
											void window.ryu?.ui?.openExternal?.({
												href: "https://docs.ryuhq.com/docs/apps/checks#cli-ci-and-mcp",
											})
										}
										size="default"
										type="button"
										variant="default"
									>
										View CI setup
									</Button>
								</div>
								<div className="settings-note">
									<Glyph name="git-branch" />
									<span>
										Use your CI provider to run the documented command or tool
										and choose its reporting and merge rules.
									</span>
								</div>
							</CardContent>
						</Card>
					) : null}
					{section === "capabilities" ? (
						<Card>
							<CardHeader>
								<div>
									<CardTitle>Checks capability matrix</CardTitle>
									<CardDescription>
										Every result is labeled by the capability that actually
										produced it.
									</CardDescription>
								</div>
								<CardAction>
									<StatusBadge status="passed" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="key-callout">
									<span className="key-callout-icon">
										<Glyph name="check" />
									</span>
									<div>
										<strong>Ryu-owned and live</strong>
										<p>
											Planning, context ingestion, feature exploration,
											live-http UI/API checks, API assertions, case/project
											runs, agent transcripts, retained evidence, healing,
											history, collections, schedules, CLI, CI exit codes, MCP,
											and analytics.
										</p>
									</div>
								</div>
								<div className="key-callout">
									<span className="key-callout-icon">
										<Glyph name="activity" />
									</span>
									<div>
										<strong>External capability required</strong>
										<p>
											Browser video, visual and accessibility assertions,
											cross-browser and real-device matrices, OAuth/GitHub,
											provider-backed data, and hosted cloud orchestration
											appear only when a granted Ryu agent or external
											integration supplies them.
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	);
}
