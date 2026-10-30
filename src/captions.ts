const NEW_LINE = '%-p'

/**
 * Append received caption data to the buffer, keeping only the last `lines` lines
 * @param buffer Captions received so far
 * @param data Data just received from the encoder
 * @param lines Number of lines to keep
 */
export function appendCaptionData(buffer: string, data: string, lines: number): string {
	buffer += data.replaceAll(/[^a-zA-Z0-9-_.,"'>%? ]/gm, '')
	buffer = buffer.replaceAll(NEW_LINE, '\n').replaceAll(/ {2,}/g, ' ')
	while (buffer.split('\n').length > lines) {
		buffer = buffer.substring(buffer.indexOf('\n') + 1)
	}
	return buffer
}

/**
 * The buffer as shown in the captions variable, with formatting codes removed
 * @param buffer Captions received so far
 */
export function captionsValue(buffer: string): string {
	return buffer.replaceAll('%-', '').replaceAll('%', '')
}
