import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	lines: number
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
			type: 'number',
			id: 'silenceInterval',
			label: 'Clear after Silence duration (s)',
			width: 4,
			default: 10,
			min: 0,
			max: 120,
			tooltip: 'Set to 0 to disable',
		},
	]
}
