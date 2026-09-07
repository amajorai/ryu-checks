import type { RyuAppBridge } from "@ryu/app-host/app-bridge";

/** The small host surface used by the Tests companion. The host owns the
 * resolved theme and sends semantic tokens over the generic shell lane. */
export interface RyuShellSubscription {
	dispose(): void;
}

export interface RyuShell {
	subscribeTheme(options: {
		onChange: (tokens: Record<string, string>) => void;
	}): RyuShellSubscription;
}

export interface RyuBridge extends RyuAppBridge {
	context?: { screen?: string } | null;
	shell: RyuShell;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
