import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	lines: number
	clearAfterInterval: boolean
	silenceInterval: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Host',
			width: 8,
			regex: Regex.HOSTNAME,
			default: '',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Target Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 23,
		},
		{
			type: 'number',
			id: 'lines',
			label: 'Number of Lines',
			width: 4,
			min: 1,
			max: 10,
			default: 2,
		},
		{
			type: 'checkbox',
			id: 'clearAfterInterval',
			label: 'Clear after silence',
			width: 4,
			default: true,
		},
		{
			type: 'number',
			id: 'silenceInterval',
			label: 'Silence duration (s)',
			width: 4,
			default: 5,
			min: 1,
			max: 60,
			//isVisible: (options) => {return options.clearAfterInterval},
		},
	]
}
