type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const getConfiguredLevel = (): LogLevel => {
	const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
	if (raw in LOG_LEVEL_ORDER) {
		return raw as LogLevel;
	}
	return "info";
};

const CONFIGURED_LEVEL = getConfiguredLevel();

const shouldLog = (level: LogLevel): boolean => {
	return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[CONFIGURED_LEVEL];
};

const serializeValue = (value: unknown): string => {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const formatContext = (context?: LogContext): string => {
	if (!context || Object.keys(context).length === 0) return "";
	const parts = Object.entries(context).map(([k, v]) => `${k}=${serializeValue(v)}`);
	return " " + parts.join(" ");
};

const formatLine = (level: LogLevel, message: string, context?: LogContext): string => {
	const ts = new Date().toISOString();
	const tag = `[${level.toUpperCase().padEnd(5)}]`;
	return `${ts} ${tag} ${message}${formatContext(context)}`;
};

const log = (level: LogLevel, message: string, context?: LogContext): void => {
	if (!shouldLog(level)) return;
	const line = formatLine(level, message, context);
	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		console.log(line);
	}
};

export const logger = {
	debug: (message: string, context?: LogContext) => log("debug", message, context),
	info: (message: string, context?: LogContext) => log("info", message, context),
	warn: (message: string, context?: LogContext) => log("warn", message, context),
	error: (message: string, context?: LogContext) => log("error", message, context),
};

export const createTaskLogger = (taskId: string) => {
	const base = (level: LogLevel, message: string, context?: LogContext) =>
		log(level, message, { taskId, ...context });

	return {
		debug: (message: string, context?: LogContext) => base("debug", message, context),
		info: (message: string, context?: LogContext) => base("info", message, context),
		warn: (message: string, context?: LogContext) => base("warn", message, context),
		error: (message: string, context?: LogContext) => base("error", message, context),
	};
};
