import type ModuleInstance from './main.js'

export type FeedbackSchema = Record<string, never>

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({})
}
