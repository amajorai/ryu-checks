import type {
	RyuCatalogModels,
	RyuCatalogSnapshot,
} from "@ryu/app-host/app-bridge";

export { subscribeCompanionTheme as subscribeLiveTheme } from "@ryu/app-host/companion-theme";

/** Read the shared Ryu runtime catalog through the host bridge. The app never
 * reaches Core/Gateway directly and receives no provider credentials. */
export async function loadRuntimeCatalog(): Promise<RyuCatalogSnapshot | null> {
	const bridge = typeof window === "undefined" ? undefined : window.ryu;
	if (!bridge?.catalog?.snapshot) {
		return null;
	}
	try {
		return await bridge.catalog.snapshot();
	} catch {
		return null;
	}
}

export function discoverRuntimeModels(
	providerId: string
): Promise<RyuCatalogModels> {
	const bridge = typeof window === "undefined" ? undefined : window.ryu;
	if (!bridge?.catalog?.models) {
		return Promise.reject(new Error("Ryu model discovery is unavailable."));
	}
	return bridge.catalog.models({ providerId });
}
