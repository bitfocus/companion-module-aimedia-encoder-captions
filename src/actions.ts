import type ModuleInstance from './main.js'

export type ActionSchema = Record<string, never>

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({})
}
