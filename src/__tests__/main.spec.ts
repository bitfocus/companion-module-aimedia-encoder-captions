import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import type { EventEmitter } from 'node:events'
import { InstanceStatus } from '@companion-module/base'
import ModuleInstance from '../main.js'
import type { ModuleConfig } from '../config.js'

type FakeSocket = EventEmitter & {
	isConnected: boolean
	sendAsync: ReturnType<typeof vi.fn<(msg: string) => Promise<boolean>>>
}

const sockets = vi.hoisted(() => [] as FakeSocket[])

// Enough of InstanceBase to construct the module without a Companion host, and a TCPHelper that never connects
vi.mock('@companion-module/base', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@companion-module/base')>()
	const { EventEmitter } = await import('node:events')
	class InstanceBase {
		constructor(_internal: unknown) {}
		get id(): string {
			return 'test'
		}
		get label(): string {
			return 'encoder'
		}
		log(): void {}
		updateStatus(): void {}
		setActionDefinitions(): void {}
		setFeedbackDefinitions(): void {}
		setVariableDefinitions(): void {}
		setVariableValues(): void {}
	}
	class TCPHelper extends EventEmitter {
		isConnected = true
		sendAsync = vi.fn(async (_msg: string) => true)
		constructor() {
			super()
			sockets.push(this)
		}
		destroy(): void {}
	}
	return { ...actual, InstanceBase, TCPHelper }
})

const CONFIG: ModuleConfig = { host: '192.0.2.1', port: 23, lines: 2, silenceInterval: 10 }

describe('ModuleInstance', () => {
	let instance: ModuleInstance
	let socket: FakeSocket
	let setVariableDefinitions: MockInstance<ModuleInstance['setVariableDefinitions']>
	let setVariableValues: MockInstance<ModuleInstance['setVariableValues']>
	let updateStatus: MockInstance<ModuleInstance['updateStatus']>

	beforeEach(async () => {
		vi.useFakeTimers()
		sockets.length = 0
		instance = new ModuleInstance({})
		setVariableDefinitions = vi.spyOn(instance, 'setVariableDefinitions')
		setVariableValues = vi.spyOn(instance, 'setVariableValues')
		updateStatus = vi.spyOn(instance, 'updateStatus')
		await instance.init(CONFIG)
		socket = sockets[0]
	})
	afterEach(async () => {
		await instance.destroy()
		vi.useRealTimers()
	})

	it('defines the captions variable by id', () => {
		expect(setVariableDefinitions).toHaveBeenCalledWith({ captions: { name: 'Captions' } })
	})

	it('requests captions once connected', async () => {
		socket.emit('connect')
		await vi.advanceTimersByTimeAsync(0)
		expect(socket.sendAsync).toHaveBeenCalledWith('\x015 F1 O\r\n')
	})

	it('sets the captions variable from received data, then clears it after the silence interval', async () => {
		socket.emit('data', Buffer.from('ONE%-pTWO  WORDS%-pTHREE\r\n'))
		await vi.advanceTimersByTimeAsync(500)
		expect(setVariableValues).toHaveBeenLastCalledWith({ captions: 'TWO WORDS\nTHREE' })

		await vi.advanceTimersByTimeAsync(CONFIG.silenceInterval * 1000)
		expect(setVariableValues).toHaveBeenLastCalledWith({ captions: '' })
	})

	it('reports an error reply as an error', async () => {
		socket.emit('data', Buffer.from('E1\r\n'))
		// StatusManager throttles updates to one every 2s
		await vi.advanceTimersByTimeAsync(2000)
		expect(updateStatus).toHaveBeenLastCalledWith(InstanceStatus.UnknownError, null)
	})
})
