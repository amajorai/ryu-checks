import { Badge } from "@ryu/ui/components/badge.tsx";
import type { Project, RunStatus, TestCase } from "./data.ts";
import { projectStatusClass, projectStatusLabel, typeClass } from "./data.ts";
import { Glyph } from "./icons.tsx";

export function StatusBadge({ status }: { status: RunStatus }) {
	return (
		<Badge
			className={`ts-badge${projectStatusClass(status)}`}
			variant="outline"
		>
			<span className="status-dot" />
			{projectStatusLabel(status)}
		</Badge>
	);
}

export function TypeBadge({
	type,
}: {
	type: Project["type"] | TestCase["type"];
}) {
	return <span className={`type-badge${typeClass(type)}`}>{type}</span>;
}

export function EmptyState({
	title,
	detail,
}: {
	title: string;
	detail: string;
}) {
	return (
		<div className="empty-state">
			<span className="empty-icon">
				<Glyph name="package" />
			</span>
			<strong>{title}</strong>
			<p>{detail}</p>
		</div>
	);
}
