import type ModuleInstance from './main.js'

export type VariablesSchema = {
	captions: string
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({ captions: { name: 'Captions' } })
}
