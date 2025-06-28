import type { Encoder_Captions } from './main.js'

export function UpdateVariableDefinitions(self: Encoder_Captions): void {
	self.setVariableDefinitions([{ variableId: 'captions', name: 'Captions' }])
}
