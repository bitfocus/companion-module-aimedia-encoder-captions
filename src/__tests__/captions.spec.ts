import { describe, expect, it } from 'vitest'
import { appendCaptionData, captionsValue } from '../captions.js'

// Synthetic: no capture from an encoder yet. These pin what the parser did before it moved out of main.ts.
describe('appendCaptionData', () => {
	it('drops control characters and line endings', () => {
		expect(appendCaptionData('', '\x01HELLO WORLD\r\n', 2)).toBe('HELLO WORLD')
	})

	it('turns the new line code into a line break, even when it arrives split across reads', () => {
		const buffer = appendCaptionData('', 'FIRST%-', 2)
		expect(appendCaptionData(buffer, 'pSECOND', 2)).toBe('FIRST\nSECOND')
	})

	it('keeps only the configured number of lines', () => {
		expect(appendCaptionData('', 'ONE%-pTWO%-pTHREE', 2)).toBe('TWO\nTHREE')
		expect(appendCaptionData('', 'ONE%-pTWO%-pTHREE', 1)).toBe('THREE')
	})

	it('collapses runs of spaces', () => {
		// The loop this replaced discarded replaceAll's result, so two spaces in a row hung the module
		expect(appendCaptionData('A ', '  B   C', 2)).toBe('A B C')
	})
})

describe('captionsValue', () => {
	it('removes the remaining formatting codes', () => {
		expect(captionsValue('%-iHELLO%\nWORLD')).toBe('iHELLO\nWORLD')
	})
})
