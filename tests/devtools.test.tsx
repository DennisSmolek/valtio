import { Suspense } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { proxy, useSnapshot } from 'valtio'
import { devtools } from 'valtio/utils'

let extensionSubscriber: ((message: any) => void) | undefined

const extension = {
  subscribe: jest.fn((f) => {
    extensionSubscriber = f
    return () => {}
  }),
  unsubscribe: jest.fn(),
  send: jest.fn(),
  init: jest.fn(),
  error: jest.fn(),
}
const extensionConnector = { connect: jest.fn(() => extension) }
;(window as any).__REDUX_DEVTOOLS_EXTENSION__ = extensionConnector

beforeEach(() => {
  extensionConnector.connect.mockClear()
  extension.subscribe.mockClear()
  extension.unsubscribe.mockClear()
  extension.send.mockClear()
  extension.init.mockClear()
  extension.error.mockClear()
  extensionSubscriber = undefined
})

it('connects to the extension by initialiing', () => {
  const obj = proxy({ count: 0 })
  devtools(obj)

  const Counter = () => {
    const snap = useSnapshot(obj)
    return (
      <>
        <div>count: {snap.count}</div>
        <button onClick={() => ++obj.count}>button</button>
      </>
    )
  }

  render(<Counter />)

  expect(extension.init).toHaveBeenLastCalledWith({ count: 0 })
})

describe('If there is no extension installed...', () => {
  beforeAll(() => {
    ;(window as any).__REDUX_DEVTOOLS_EXTENSION__ = undefined
  })
  afterAll(() => {
    ;(window as any).__REDUX_DEVTOOLS_EXTENSION__ = extensionConnector
  })

  const obj = proxy({ count: 0 })
  devtools(obj)

  const Counter = () => {
    const snap = useSnapshot(obj)
    return (
      <>
        <div>count: {snap.count}</div>
        <button onClick={() => ++obj.count}>button</button>
      </>
    )
  }

  it('does not throw', () => {
    devtools(obj)
    expect(() => {
      render(<Counter />)
    }).not.toThrow()
  })

  it('warns in dev env', () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const originalConsoleWarn = console.warn
    console.warn = jest.fn()
    devtools(obj)

    render(<Counter />)
    expect(console.warn).toHaveBeenLastCalledWith(
      '[Warning] Please install/enable Redux devtools extension'
    )

    process.env.NODE_ENV = originalNodeEnv
    console.warn = originalConsoleWarn
  })

  it('does not warn if not in dev env', () => {
    const consoleWarn = jest.spyOn(console, 'warn')

    render(<Counter />)
    expect(consoleWarn).not.toBeCalled()

    consoleWarn.mockRestore()
  })
})

it('updating state should call devtools.send', async () => {
  const obj = proxy({ count: 0 })
  devtools(obj)

  const Counter = () => {
    const snap = useSnapshot(obj)
    return (
      <>
        <div>count: {snap.count}</div>
        <button onClick={() => ++obj.count}>button</button>
      </>
    )
  }

  extension.send.mockClear()
  const { getByText, findByText } = render(<Counter />)

  expect(extension.send).toBeCalledTimes(0)
  fireEvent.click(getByText('button'))
  await findByText('count: 1')
  expect(extension.send).toBeCalledTimes(1)
  fireEvent.click(getByText('button'))
  await findByText('count: 2')
  expect(extension.send).toBeCalledTimes(2)
})

describe('when it receives an message of type...', () => {
  it('updating state with ACTION', async () => {
    const obj = proxy({ count: 0 })
    devtools(obj)

    const Counter = () => {
      const snap = useSnapshot(obj)
      return (
        <>
          <div>count: {snap.count}</div>
          <button onClick={() => ++obj.count}>button</button>
        </>
      )
    }

    extension.send.mockClear()
    const { getByText, findByText } = render(
      <Suspense fallback={'loading'}>
        <Counter />
      </Suspense>
    )

    expect(extension.send).toBeCalledTimes(0)
    fireEvent.click(getByText('button'))
    await findByText('count: 1')
    expect(extension.send).toBeCalledTimes(1)
    act(() =>
      (extensionSubscriber as (message: any) => void)({
        type: 'ACTION',
        payload: JSON.stringify({ count: 0 }),
      })
    )
    await findByText('count: 0')
    expect(extension.send).toBeCalledTimes(2)
  })

  describe('DISPATCH and payload of type...', () => {
    it('dispatch & COMMIT', async () => {
      const obj = proxy({ count: 0 })
      devtools(obj)

      const Counter = () => {
        const snap = useSnapshot(obj)
        return (
          <>
            <div>count: {snap.count}</div>
            <button onClick={() => ++obj.count}>button</button>
          </>
        )
      }

      extension.send.mockClear()
      const { getByText, findByText } = render(<Counter />)

      expect(extension.send).toBeCalledTimes(0)
      fireEvent.click(getByText('button'))
      await findByText('count: 1')
      expect(extension.send).toBeCalledTimes(1)
      fireEvent.click(getByText('button'))
      await findByText('count: 2')
      act(() =>
        (extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'COMMIT' },
        })
      )
      await findByText('count: 2')
      expect(extension.init).toBeCalledWith({ count: 2 })
    })

    it('dispatch & IMPORT_STATE', async () => {
      const obj = proxy({ count: 0 })
      devtools(obj)

      const Counter = () => {
        const snap = useSnapshot(obj)
        return (
          <>
            <div>count: {snap.count}</div>
            <button onClick={() => ++obj.count}>button</button>
          </>
        )
      }

      extension.send.mockClear()
      const { getByText, findByText } = render(<Counter />)

      const nextLiftedState = {
        actionsById: ['5', '6'],
        computedStates: [{ state: { count: 5 } }, { state: { count: 6 } }],
      }

      expect(extension.send).toBeCalledTimes(0)
      fireEvent.click(getByText('button'))
      await findByText('count: 1')
      expect(extension.send).toBeCalledTimes(1)
      fireEvent.click(getByText('button'))
      await findByText('count: 2')
      act(() =>
        (extensionSubscriber as (message: any) => void)({
          type: 'DISPATCH',
          payload: { type: 'IMPORT_STATE', nextLiftedState },
        })
      )
      expect(extension.init).toBeCalledWith({ count: 5 })
      await findByText('count: 6')
    })

    describe('JUMP_TO_STATE | JUMP_TO_ACTION...', () => {
      it('time travelling', async () => {
        const obj = proxy({ count: 0 })
        devtools(obj)

        const Counter = () => {
          const snap = useSnapshot(obj)
          return (
            <>
              <div>count: {snap.count}</div>
              <button onClick={() => ++obj.count}>button</button>
            </>
          )
        }

        extension.send.mockClear()
        const { getByText, findByText } = render(<Counter />)

        expect(extension.send).toBeCalledTimes(0)
        fireEvent.click(getByText('button'))
        await findByText('count: 1')
        expect(extension.send).toBeCalledTimes(1)
        act(() =>
          (extensionSubscriber as (message: any) => void)({
            type: 'DISPATCH',
            payload: { type: 'JUMP_TO_ACTION' },
            state: JSON.stringify({ count: 0 }),
          })
        )
        await findByText('count: 0')
        expect(extension.send).toBeCalledTimes(1)
        fireEvent.click(getByText('button'))
        await findByText('count: 1')
        fireEvent.click(getByText('button'))
        await findByText('count: 2')
        expect(extension.send).toBeCalledTimes(3)
      })
    })
  })
})
