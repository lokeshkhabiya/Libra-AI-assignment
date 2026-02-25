/**
 * Sanitizes a JS string so it is safe to persist in UTF-8 database text columns.
 * - strips NUL bytes (Postgres rejects them)
 * - removes unpaired UTF-16 surrogates
 */
export const sanitizeDbText = (value: string): string => {
	let result = "";

	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);

		// Strip NUL bytes.
		if (code === 0x0000) {
			continue;
		}

		// High surrogate.
		if (code >= 0xd800 && code <= 0xdbff) {
			const next = value.charCodeAt(i + 1);
			if (next >= 0xdc00 && next <= 0xdfff) {
				result += value[i] ?? "";
				result += value[i + 1] ?? "";
				i += 1;
			}
			continue;
		}

		// Lone low surrogate.
		if (code >= 0xdc00 && code <= 0xdfff) {
			continue;
		}

		result += value[i] ?? "";
	}

	return result;
};
