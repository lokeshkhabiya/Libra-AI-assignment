export type TextChunk = {
	chunkIndex: number;
	content: string;
	tokenCount: number;
};

const CHUNK_TOKEN_TARGET = 500;
const CHUNK_TOKEN_OVERLAP = 50;

const tokenize = (text: string): string[] => {
	return text
		.trim()
		.split(/\s+/)
		.filter(Boolean);
};

const estimateTokens = (text: string): number => {
	return tokenize(text).length;
};

const takeTailTokens = (text: string, tokenCount: number): string => {
	const tokens = tokenize(text);
	if (tokens.length <= tokenCount) {
		return text.trim();
	}

	return tokens.slice(tokens.length - tokenCount).join(" ");
};

const normalizeChunkText = (text: string): string => {
	return text
		.replace(/\u0000/g, "")
		.replace(/\r/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
};

export const chunkText = (text: string): TextChunk[] => {
	const normalized = normalizeChunkText(text);
	if (!normalized) {
		return [];
	}

	const paragraphs = normalized
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);

	const chunks: TextChunk[] = [];
	let currentText = "";
	let currentTokenCount = 0;

	const flushChunk = () => {
		const content = currentText.trim();
		if (!content) {
			return;
		}

		chunks.push({
			chunkIndex: chunks.length,
			content,
			tokenCount: currentTokenCount,
		});

		const overlapText = takeTailTokens(content, CHUNK_TOKEN_OVERLAP);
		currentText = overlapText;
		currentTokenCount = estimateTokens(currentText);
	};

	for (const paragraph of paragraphs) {
		const paragraphTokens = estimateTokens(paragraph);

		if (paragraphTokens >= CHUNK_TOKEN_TARGET) {
			if (currentText.trim()) {
				flushChunk();
			}

			const words = tokenize(paragraph);
			for (let i = 0; i < words.length; i += CHUNK_TOKEN_TARGET - CHUNK_TOKEN_OVERLAP) {
				const chunkWords = words.slice(i, i + CHUNK_TOKEN_TARGET);
				const content = chunkWords.join(" ");
				chunks.push({
					chunkIndex: chunks.length,
					content,
					tokenCount: chunkWords.length,
				});
			}

			currentText = "";
			currentTokenCount = 0;
			continue;
		}

		const nextText = currentText ? `${currentText}\n\n${paragraph}` : paragraph;
		const nextTokenCount = estimateTokens(nextText);

		if (nextTokenCount > CHUNK_TOKEN_TARGET && currentText.trim()) {
			flushChunk();
			currentText = paragraph;
			currentTokenCount = paragraphTokens;
			continue;
		}

		currentText = nextText;
		currentTokenCount = nextTokenCount;
	}

	if (currentText.trim()) {
		chunks.push({
			chunkIndex: chunks.length,
			content: currentText.trim(),
			tokenCount: currentTokenCount,
		});
	}

	return chunks;
};
