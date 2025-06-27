import {
	InstanceBase,
	runEntrypoint,
	InstanceStatus,
	SomeCompanionConfigField,
	TCPHelper,
} from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { StatusManager } from './status.js'

const REQUEST_CAPTIONS_STRING = `\x015 F1 O\r\n`
const ERROR_MESSAGE = 'E1'
const NEW_LINE = '%-p'
const RECONNECT_INTERVAL = 5000
const KEEP_ALIVE = ' \n'
const KEEP_ALIVE_INTERVAL = 60000

export class HD1492_Captions extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	#socket: TCPHelper | undefined = undefined
	#statusManager = new StatusManager(this, { status: InstanceStatus.Connecting, message: 'Initialising' }, 1000)
	#captions: string[] = []
	#reconnectTimer: NodeJS.Timeout | undefined = undefined
	#drainTimer: NodeJS.Timeout | undefined = undefined
	#keepAliveTimer: NodeJS.Timeout | undefined = undefined
	#buffer: string = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
		this.configUpdated(config).catch(() => {})
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy id: ${this.id} label: ${this.label}`)
		if (this.#socket) {
			this.#socket.destroy()
		}
		this.#clearReconnectTimer()
		this.#clearDrainTimer()
		this.#clearKeepAliveTimer()
		this.#statusManager.destroy()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		process.title = this.label
		this.#statusManager.updateStatus(InstanceStatus.Connecting)
		this.initTcp(config.host, config.port)
	}
	#clearDrainTimer(): void {
		if (this.#drainTimer) {
			clearTimeout(this.#drainTimer)
			this.#drainTimer = undefined
		}
	}
	#clearKeepAliveTimer(): void {
		if (this.#keepAliveTimer) {
			clearTimeout(this.#keepAliveTimer)
			this.#keepAliveTimer = undefined
		}
	}

	#startKeepAlive(kaInterval: number = KEEP_ALIVE_INTERVAL, msg: string = KEEP_ALIVE): void {
		this.#clearKeepAliveTimer()
		this.#keepAliveTimer = setTimeout(() => {
			if (this.#socket && this.#socket.isConnected) {
				this.#socket.send(msg).catch(() => {})
			}
			this.#startKeepAlive()
		}, kaInterval)
	}

	#clearReconnectTimer(): void {
		if (this.#reconnectTimer) {
			clearTimeout(this.#reconnectTimer)
			this.#reconnectTimer = undefined
		}
	}
	async #requestCaptionsData(): Promise<boolean> {
		if (this.#socket && this.#socket.isConnected) {
			this.log('debug', `Sending: ${REQUEST_CAPTIONS_STRING}`)
			return await this.#socket.send(REQUEST_CAPTIONS_STRING)
		}
		return false
	}

	#reconnectionOnTimeout(host: string, port: number, timeout: number = RECONNECT_INTERVAL): void {
		this.#reconnectTimer = setTimeout(() => {
			this.initTcp(host, port)
		}, timeout)
	}

	initTcp(host: string, port: number): void {
		const errorEvent = (err: Error) => {
			this.log('error', JSON.stringify(err))
			this.#clearReconnectTimer()
			this.#reconnectionOnTimeout(host, port)
		}
		const connectEvent = () => {
			this.#buffer = ''
			this.#statusManager.updateStatus(InstanceStatus.Ok, `Connected`)
			this.#requestCaptionsData()
				.then((result) => {
					if (!result) {
						this.log('warn', `Caption request failed`)
						this.#statusManager.updateStatus(InstanceStatus.UnknownWarning, `Caption request failed`)
					} else {
						this.log('debug', `Caption request sent`)
					}
				})
				.catch(() => {})
		}
		const dataEvent = (d: Buffer<ArrayBufferLike>) => {
			this.log(`debug`, `Data received: ${d}`)
			this.#clearDrainTimer()
			this.#clearKeepAliveTimer()
			this.#buffer += d.toString().replaceAll(/[^a-zA-Z0-9-_.,"'>%? ]/gm, '')
			while (this.#buffer.indexOf('  ') !== -1) {
				this.#buffer.replaceAll('  ', ' ')
			}
			let i = 0,
				line = '',
				offset = 0,
				update = false
			while ((i = this.#buffer.indexOf(NEW_LINE, offset)) !== -1) {
				line = this.#buffer.substring(offset, i)
				offset = i + 3
				this.#captions.push(line)
				update = true
			}
			if ((this.#buffer = this.#buffer.substring(offset)) == ERROR_MESSAGE) {
				this.log('error', `Error recieved`)
				this.#statusManager.updateStatus(InstanceStatus.UnknownError)
				return
			}
			if (update) {
				while (this.#captions.length > this.config.lines) {
					this.#captions.shift()
				}
				let captionVar: string = ''
				for (line of this.#captions) {
					if (captionVar != '') captionVar += '\n'
					captionVar += line
				}
				this.setVariableValues({ captions: captionVar })
			}
		}
		const drainEvent = () => {
			if (this.config.clearAfterInterval) {
				this.#drainTimer = setInterval(() => {
					this.#captions = []
					this.setVariableValues({ captions: '' })
				}, this.config.silenceInterval * 1000)
			}
			this.#startKeepAlive()
		}
		const endEvent = () => {
			this.log('warn', `Disconnected from ${host}`)
			this.#clearReconnectTimer()
			this.#reconnectionOnTimeout(host, port)
		}
		const statusChangeEvent = (status: InstanceStatus, message: string | undefined) => {
			this.#statusManager.updateStatus(status, message ?? '')
		}
		if (this.#socket) this.#socket.destroy()
		if (host === '') {
			this.#statusManager.updateStatus(InstanceStatus.BadConfig, 'No host')
			return
		}
		this.#clearReconnectTimer()
		this.#clearDrainTimer()
		this.#clearKeepAliveTimer()
		try {
			this.#socket = new TCPHelper(host, port)
			this.#socket.on('connect', connectEvent)
			this.#socket.on('data', dataEvent)
			this.#socket.on('drain', drainEvent)
			this.#socket.on('end', endEvent)
			this.#socket.on('error', errorEvent)
			this.#socket.on('status_change', statusChangeEvent)
		} catch (err) {
			this.log('error', `Failed to initialize socket - ${err}`)
			this.#statusManager.updateStatus(InstanceStatus.UnknownError)
		}
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(HD1492_Captions, UpgradeScripts)
