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
const NEW_PARAGRAPH = '%-p'
const RECONNECT_INTERVAL = 5000

export class HD1492_Captions extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	#socket: TCPHelper | undefined = undefined
	#statusManager = new StatusManager(this, { status: InstanceStatus.Connecting, message: 'Initialising' }, 1000)
	#captions: string[] = []
	#reconnectTimer: NodeJS.Timeout | undefined = undefined
	#drainTimer: NodeJS.Timeout | undefined = undefined

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

	#clearReconnectTimer(): void {
		if (this.#reconnectTimer) {
			clearTimeout(this.#reconnectTimer)
			this.#reconnectTimer = undefined
		}
	}
	async #requestCaptionsData(): Promise<boolean> {
		if (!this.#socket) return false
		this.log('debug', `Sending: ${REQUEST_CAPTIONS_STRING}`)
		return await this.#socket?.send(REQUEST_CAPTIONS_STRING)
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
			this.#statusManager.updateStatus(InstanceStatus.Ok, `Connected`)
			this.#requestCaptionsData().catch(() => {})
		}
		const dataEvent = (d: Buffer<ArrayBufferLike>) => {
			this.log(`debug`, `Data received: ${d}`)
			this.#clearDrainTimer()
			const captions = d.toString().split(NEW_PARAGRAPH)
			if (captions.length > 0 && this.#captions.length > 0) {
				this.#captions[this.#captions.length - 1] += captions.shift()
			}
			captions.forEach((line) => {
				if (line == ERROR_MESSAGE) {
					this.log('error', `Error recieved`)
					this.#statusManager.updateStatus(InstanceStatus.UnknownError)
					return
				} else {
					this.#captions.push(line)
				}
				while (this.#captions.length > this.config.lines) {
					this.#captions.shift()
				}
				let captionVar: string = ''
				for (line of this.#captions) {
					captionVar += line + '\n'
				}
				this.setVariableValues({ captions: captionVar })
			})
		}
		const drainEvent = () => {
			if (this.config.clearAfterInterval) {
				this.#drainTimer = setInterval(() => {
					this.#captions = []
					this.setVariableValues({ captions: '' })
				}, this.config.silenceInterval * 1000)
			}
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
