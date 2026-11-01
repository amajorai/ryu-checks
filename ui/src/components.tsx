import { Badge } from "@ryu/ui/components/badge.tsx";
import { Card } from "@ryu/ui/components/card.tsx";
import type { ReactNode } from "react";
import type { Project, RunStatus, TestCase } from "./data.ts";
import { projectStatusLabel, typeClass } from "./data.ts";
import { Glyph } from "./icons.tsx";

export function ChecksCard({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={className}>
			<Card>{children}</Card>
		</div>
	);
}

export function StatusBadge({ status }: { status: RunStatus }) {
	return (
		<Badge data-status={status} variant="outline">
			<span aria-hidden="true" className="status-dot" data-status={status} />
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
