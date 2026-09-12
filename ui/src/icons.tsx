import {
	Alert02Icon,
	Analytics01Icon,
	ArrowDown01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	CheckmarkCircle02Icon,
	Clock01Icon,
	CodeIcon,
	Copy01Icon,
	File01Icon,
	FilterIcon,
	Folder01Icon,
	GitBranchIcon,
	GithubIcon,
	Home01Icon,
	Key01Icon,
	Notification01Icon,
	PackageOpenIcon,
	PlayIcon,
	PlusSignIcon,
	Search01Icon,
	Settings01Icon,
	TestTube01Icon,
	UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type IconName =
	| "activity"
	| "alert"
	| "api"
	| "arrow-down"
	| "arrow-left"
	| "arrow-right"
	| "check"
	| "clock"
	| "code"
	| "copy"
	| "file"
	| "filter"
	| "folder"
	| "github"
	| "git-branch"
	| "home"
	| "key"
	| "notification"
	| "package"
	| "play"
	| "plus"
	| "search"
	| "settings"
	| "test"
	| "user";
const icons = {
	activity: Analytics01Icon,
	alert: Alert02Icon,
	api: CodeIcon,
	"arrow-down": ArrowDown01Icon,
	"arrow-left": ArrowLeft01Icon,
	"arrow-right": ArrowRight01Icon,
	check: CheckmarkCircle02Icon,
	clock: Clock01Icon,
	code: CodeIcon,
	copy: Copy01Icon,
	file: File01Icon,
	filter: FilterIcon,
	folder: Folder01Icon,
	github: GithubIcon,
	"git-branch": GitBranchIcon,
	home: Home01Icon,
	key: Key01Icon,
	notification: Notification01Icon,
	package: PackageOpenIcon,
	play: PlayIcon,
	plus: PlusSignIcon,
	search: Search01Icon,
	settings: Settings01Icon,
	test: TestTube01Icon,
	user: UserCircleIcon,
} as const;

export function Glyph({
	name,
	className = "",
}: {
	name: IconName;
	className?: string;
}) {
	return <HugeiconsIcon className={`glyph${className}`} icon={icons[name]} />;
}
